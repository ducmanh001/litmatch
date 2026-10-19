import { Logger } from '@nestjs/common';

import { RetentionJob } from './retention-job';

import type { PurgeStep } from './batched-purge';

class TestRetentionJob extends RetentionJob {
  protected readonly jobName = 'test-retention';
  protected readonly logger = new Logger('TestRetentionJob');
  stepsToRun: PurgeStep[] = [];

  constructor(
    dataSource: never,
    config: never,
    scheduler: never,
    meter: never,
  ) {
    super(dataSource, config, scheduler, meter);
  }

  protected steps(): PurgeStep[] {
    return this.stepsToRun;
  }
}

const STEP: PurgeStep = {
  label: 'things:age',
  table: 'things',
  primaryKey: 'id',
  predicate: 'created_at < now() - make_interval(days => $2)',
  params: [7],
};

describe('RetentionJob (khung chung, ADR 0013)', () => {
  let settings: Record<string, unknown>;
  let query: jest.Mock;
  let scheduler: {
    addInterval: jest.Mock;
    doesExist: jest.Mock;
    deleteInterval: jest.Mock;
  };
  let counterAdd: jest.Mock;
  let gaugeRecord: jest.Mock;
  let job: TestRetentionJob;

  beforeEach(() => {
    settings = {
      RETENTION_MODE: 'delete',
      RETENTION_INTERVAL_MS: 60_000,
      RETENTION_BATCH_SIZE: 100,
      RETENTION_MAX_BATCHES_PER_TICK: 3,
      RETENTION_BATCH_PAUSE_MS: 0,
    };
    query = jest.fn().mockResolvedValue([{ n: 0 }]);
    // Giả lập SchedulerRegistry nhưng PHẢI clearInterval khi gỡ: ManagedInterval tạo setInterval thật,
    // nếu không gỡ thì timer giữ tiến trình Jest không thoát.
    const intervals = new Map<string, NodeJS.Timeout>();
    scheduler = {
      addInterval: jest.fn((name: string, interval: NodeJS.Timeout) => {
        intervals.set(name, interval);
      }),
      doesExist: jest.fn((_type: string, name: string) => intervals.has(name)),
      deleteInterval: jest.fn((name: string) => {
        clearInterval(intervals.get(name));
        intervals.delete(name);
      }),
    };
    counterAdd = jest.fn();
    gaugeRecord = jest.fn();
    const meter = {
      createCounter: jest.fn(() => ({ add: counterAdd })),
      createGauge: jest.fn(() => ({ record: gaugeRecord })),
    };
    const config = {
      getOrThrow: (key: string) => {
        if (!(key in settings)) throw new Error(`missing ${key}`);
        return settings[key];
      },
    };
    job = new TestRetentionJob(
      { query } as never,
      config as never,
      scheduler as never,
      meter as never,
    );
    job.stepsToRun = [STEP];
  });

  afterEach(() => {
    job.onApplicationShutdown();
    jest.restoreAllMocks();
  });

  it('RETENTION_MODE=off: không đăng ký interval, runOnce không chạm DB', async () => {
    settings['RETENTION_MODE'] = 'off';

    job.onApplicationBootstrap();
    const results = await job.runOnce();

    expect(scheduler.addInterval).not.toHaveBeenCalled();
    expect(results).toEqual([]);
    expect(query).not.toHaveBeenCalled();
  });

  it.each(['dry-run', 'delete'])(
    'mode=%s: đăng ký đúng một interval theo RETENTION_INTERVAL_MS và gỡ khi tắt',
    (mode) => {
      settings['RETENTION_MODE'] = mode;

      job.onApplicationBootstrap();
      expect(scheduler.addInterval).toHaveBeenCalledTimes(1);
      expect(scheduler.addInterval.mock.calls[0]?.[0]).toBe('test-retention');

      job.onApplicationShutdown();
      expect(scheduler.deleteInterval).toHaveBeenCalledWith('test-retention');
    },
  );

  it('delete: chạy từng quy tắc với giới hạn lô từ config, đếm hàng đã xoá vào counter theo quy tắc', async () => {
    query
      .mockResolvedValueOnce([{ n: 100 }])
      .mockResolvedValueOnce([{ n: 40 }]);

    const results = await job.runOnce();

    expect(results).toEqual([
      {
        label: 'things:age',
        mode: 'delete',
        rows: 140,
        batches: 2,
        capped: false,
      },
    ]);
    expect(query.mock.calls[0]?.[1]).toEqual([100, 7]);
    expect(counterAdd).toHaveBeenCalledWith(140, { rule: 'things:age' });
    expect(gaugeRecord).not.toHaveBeenCalled();
  });

  it('dry-run: không xoá, báo số hàng đủ điều kiện', async () => {
    settings['RETENTION_MODE'] = 'dry-run';
    query.mockResolvedValue([{ n: 250 }]);

    const results = await job.runOnce();

    expect(results[0]).toMatchObject({
      mode: 'dry-run',
      rows: 250,
      batches: 0,
    });
    expect(String(query.mock.calls[0]?.[0])).not.toContain('DELETE');
    // dry-run dùng gauge (giá trị gần nhất), KHÔNG cộng dồn counter qua các tick
    expect(gaugeRecord).toHaveBeenCalledWith(250, { rule: 'things:age' });
    expect(counterAdd).not.toHaveBeenCalled();
  });

  it('dry-run lặp lại nhiều tick: gauge luôn là số mới nhất, không cộng dồn', async () => {
    settings['RETENTION_MODE'] = 'dry-run';
    query
      .mockResolvedValueOnce([{ n: 250 }])
      .mockResolvedValueOnce([{ n: 240 }]);

    await job.runOnce();
    await job.runOnce();

    expect(gaugeRecord.mock.calls.map((call) => call[0])).toEqual([250, 240]);
    expect(counterAdd).not.toHaveBeenCalled();
  });

  it('sau shutdown không bắt đầu quy tắc/lô mới', async () => {
    job.onApplicationShutdown();
    await expect(job.runOnce()).resolves.toEqual([]);
    expect(query).not.toHaveBeenCalled();
  });

  it('hết ngân sách thời gian của tick → bỏ qua quy tắc sau, để tick kế tiếp', async () => {
    job.stepsToRun = [STEP, { ...STEP, label: 'things:other', params: [9] }];
    const t0 = 1_000_000;
    const now = jest.spyOn(Date, 'now');
    // lần đọc đầu (tính deadline) = t0; sau quy tắc đầu đã quá 30 s
    now.mockReturnValueOnce(t0).mockReturnValue(t0 + 31_000);

    const results = await job.runOnce();

    expect(results.map((r) => r.label)).toEqual(['things:age']);
    now.mockRestore();
  });

  it('xoay vòng quy tắc bắt đầu mỗi tick để backlog lớn không bỏ đói quy tắc sau', async () => {
    const A = { ...STEP, label: 'a', params: [1] };
    const B = { ...STEP, label: 'b', params: [2] };
    job.stepsToRun = [A, B];

    await job.runOnce();
    await job.runOnce();

    // param thứ hai của mỗi truy vấn = param của quy tắc (param đầu là kích thước lô)
    expect(query.mock.calls.map((call) => (call[1] as number[])[1])).toEqual([
      1, 2, 2, 1,
    ]);
  });

  it('không có quy tắc (mọi số ngày = 0) → không truy vấn', async () => {
    job.stepsToRun = [];
    await expect(job.runOnce()).resolves.toEqual([]);
    expect(query).not.toHaveBeenCalled();
  });

  it('hai tick chồng nhau trong một process: tick sau bị bỏ qua, không xoá song song', async () => {
    let release: (value: Array<{ n: number }>) => void = () => undefined;
    query.mockReturnValueOnce(
      new Promise<Array<{ n: number }>>((resolve) => {
        release = resolve;
      }),
    );

    const first = job.runOnce();
    const second = await job.runOnce();
    expect(second).toEqual([]);

    release([{ n: 0 }]);
    await first;
    expect(query).toHaveBeenCalledTimes(1);
  });

  it('log khi có hàng bị xử lý và còn backlog', async () => {
    const log = jest.spyOn(Logger.prototype, 'log').mockImplementation();
    query.mockResolvedValue([{ n: 100 }]); // lô nào cũng đầy → chạm trần 3 lô

    await job.runOnce();

    expect(log).toHaveBeenCalledWith(
      expect.stringContaining('300 hàng / 3 lô'),
    );
    expect(log).toHaveBeenCalledWith(expect.stringContaining('còn backlog'));
  });

  it('lỗi DB trong một quy tắc được ném ra (ManagedInterval log, tick sau thử lại)', async () => {
    query.mockRejectedValue(new Error('db down'));
    await expect(job.runOnce()).rejects.toThrow('db down');
    // và không để lại cờ "đang chạy": tick sau chạy được
    query.mockResolvedValue([{ n: 0 }]);
    await expect(job.runOnce()).resolves.toHaveLength(1);
  });
});
