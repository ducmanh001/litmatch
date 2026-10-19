import { buildCountSql, buildDeleteSql, purgeInBatches } from './batched-purge';

import type { PurgeStep } from './batched-purge';

const STEP: PurgeStep = {
  label: 'notifications:read',
  table: 'notifications',
  primaryKey: 'id',
  predicate:
    'read_at IS NOT NULL AND read_at < now() - make_interval(days => $2)',
  params: [90],
  orderBy: 'read_at',
};

const options = (over: Partial<Parameters<typeof purgeInBatches>[2]> = {}) => ({
  mode: 'delete' as const,
  batchSize: 1_000,
  maxBatches: 5,
  pauseMs: 0,
  ...over,
});

describe('buildDeleteSql / buildCountSql', () => {
  it('chọn lô ngắn rồi xoá trong MỘT câu lệnh, SKIP LOCKED để không chặn writer', () => {
    const sql = buildDeleteSql(STEP).replace(/\s+/gu, ' ');
    // MATERIALIZED: tập hàng đã khoá phải đúng bằng tập bị xoá (planner không inline CTE rồi quét lại)
    expect(sql).toContain('WITH doomed AS MATERIALIZED (');
    expect(sql).toContain('FROM notifications WHERE read_at IS NOT NULL');
    expect(sql).toContain('ORDER BY read_at LIMIT $1 FOR UPDATE SKIP LOCKED');
    expect(sql).toContain('DELETE FROM notifications t USING doomed d');
    expect(sql).toContain('WHERE t.id = d.id RETURNING 1');
    expect(sql).toContain('SELECT count(*)::int AS n FROM removed');
  });

  it('thứ tự xoá là tuỳ chọn', () => {
    const sql = buildDeleteSql({ ...STEP, orderBy: undefined });
    expect(sql).not.toContain('ORDER BY');
  });

  it('đếm có chặn trên bằng LIMIT $1 (không quét cả bảng)', () => {
    const sql = buildCountSql(STEP).replace(/\s+/gu, ' ');
    expect(sql).toContain(
      'SELECT 1 FROM notifications WHERE read_at IS NOT NULL',
    );
    expect(sql).toContain('LIMIT $1');
    expect(sql).not.toContain('DELETE');
  });

  it.each(['notifications; DROP TABLE users', 'Notifications', 'a b'])(
    'từ chối tên bảng không hợp lệ (%s) ở cả câu xoá lẫn câu đếm',
    (table) => {
      expect(() => buildDeleteSql({ ...STEP, table })).toThrow(/không hợp lệ/u);
      expect(() => buildCountSql({ ...STEP, table })).toThrow(/không hợp lệ/u);
    },
  );

  it('từ chối khoá chính không hợp lệ ở câu xoá (câu đếm không dùng khoá chính)', () => {
    const step = { ...STEP, primaryKey: 'id) --' };
    expect(() => buildDeleteSql(step)).toThrow(/không hợp lệ/u);
    expect(() => buildCountSql(step)).not.toThrow();
  });
});

describe('purgeInBatches', () => {
  it('delete: tham số = [kích thước lô, ...params của quy tắc]; dừng khi một lô không đầy', async () => {
    const query = jest
      .fn()
      .mockResolvedValueOnce([{ n: 1_000 }])
      .mockResolvedValueOnce([{ n: 1_000 }])
      .mockResolvedValueOnce([{ n: 120 }]);

    const result = await purgeInBatches({ query } as never, STEP, options());

    expect(result).toEqual({
      label: 'notifications:read',
      mode: 'delete',
      rows: 2_120,
      batches: 3,
      capped: false,
    });
    expect(query).toHaveBeenCalledTimes(3);
    expect(query.mock.calls[0]?.[1]).toEqual([1_000, 90]);
  });

  it('delete: chạm trần số lô mỗi tick → capped=true để tick sau tiếp tục', async () => {
    const query = jest.fn().mockResolvedValue([{ n: 1_000 }]);

    const result = await purgeInBatches(
      { query } as never,
      STEP,
      options({ maxBatches: 3 }),
    );

    expect(result).toMatchObject({ rows: 3_000, batches: 3, capped: true });
    expect(query).toHaveBeenCalledTimes(3);
  });

  it('delete: bảng đã sạch → một truy vấn, 0 hàng, không còn backlog', async () => {
    const query = jest.fn().mockResolvedValue([{ n: 0 }]);

    const result = await purgeInBatches({ query } as never, STEP, options());

    expect(result).toMatchObject({ rows: 0, batches: 1, capped: false });
  });

  it('delete: nghỉ pauseMs giữa các lô (không nghỉ sau lô cuối)', async () => {
    jest.useFakeTimers();
    try {
      const query = jest
        .fn()
        .mockResolvedValueOnce([{ n: 10 }])
        .mockResolvedValueOnce([{ n: 10 }])
        .mockResolvedValueOnce([{ n: 3 }]);
      const run = purgeInBatches(
        { query } as never,
        STEP,
        options({ batchSize: 10, pauseMs: 50 }),
      );

      await jest.advanceTimersByTimeAsync(49);
      expect(query).toHaveBeenCalledTimes(1); // đang nghỉ sau lô 1
      await jest.advanceTimersByTimeAsync(1);
      expect(query).toHaveBeenCalledTimes(2);
      await jest.advanceTimersByTimeAsync(50);
      await expect(run).resolves.toMatchObject({ rows: 23, batches: 3 });
    } finally {
      jest.useRealTimers();
    }
  });

  it('quá mốc deadlineAt → không bắt đầu lô mới (backlog để tick sau)', async () => {
    const query = jest.fn().mockResolvedValue([{ n: 1_000 }]);
    const now = jest
      .spyOn(Date, 'now')
      .mockReturnValueOnce(1_000) // sau lô 1: còn hạn
      .mockReturnValue(5_000); // sau lô 2: quá hạn

    const result = await purgeInBatches(
      { query } as never,
      STEP,
      options({ maxBatches: 10, deadlineAt: 2_000 }),
    );

    expect(result).toMatchObject({ rows: 2_000, batches: 2, capped: true });
    now.mockRestore();
  });

  it('shouldStop=true (shutdown) → dừng sau lô đang chạy, không nghỉ/không lô mới', async () => {
    const query = jest.fn().mockResolvedValue([{ n: 1_000 }]);

    const result = await purgeInBatches(
      { query } as never,
      STEP,
      options({ maxBatches: 10, shouldStop: () => true }),
    );

    expect(result).toMatchObject({ rows: 1_000, batches: 1, capped: true });
    expect(query).toHaveBeenCalledTimes(1);
  });

  it('dry-run: chỉ đếm (trần = lô × số lô), KHÔNG chạy câu DELETE', async () => {
    const query = jest.fn().mockResolvedValue([{ n: 4_200 }]);

    const result = await purgeInBatches(
      { query } as never,
      STEP,
      options({ mode: 'dry-run', batchSize: 1_000, maxBatches: 5 }),
    );

    expect(result).toEqual({
      label: 'notifications:read',
      mode: 'dry-run',
      rows: 4_200,
      batches: 0,
      capped: false,
    });
    expect(query).toHaveBeenCalledTimes(1);
    expect(String(query.mock.calls[0]?.[0])).not.toContain('DELETE');
    expect(query.mock.calls[0]?.[1]).toEqual([5_000, 90]);
  });

  it('dry-run: đếm chạm trần → capped=true (còn nhiều hơn số đã báo)', async () => {
    const query = jest.fn().mockResolvedValue([{ n: 5_000 }]);

    const result = await purgeInBatches(
      { query } as never,
      STEP,
      options({ mode: 'dry-run', batchSize: 1_000, maxBatches: 5 }),
    );

    expect(result).toMatchObject({ rows: 5_000, capped: true });
  });

  it('lỗi DB được ném ra (job chịu trách nhiệm log, tick sau thử lại)', async () => {
    const query = jest.fn().mockRejectedValue(new Error('db down'));
    await expect(
      purgeInBatches({ query } as never, STEP, options()),
    ).rejects.toThrow('db down');
  });
});
