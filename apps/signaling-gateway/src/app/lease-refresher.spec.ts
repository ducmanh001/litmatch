import { LeaseRefresher } from './lease-refresher';

import type { LeaseRef, RefreshOutcome } from './connection-quota.service';

const LEASE_MS = 90_000;
const REFRESH_MS = 30_000;

function setup(options: { maxBatch?: number; random?: () => number } = {}): {
  refresher: LeaseRefresher;
  refreshMany: jest.Mock<Promise<RefreshOutcome[]>, [readonly LeaseRef[]]>;
  onOutcomes: jest.Mock;
  clock: { now: number };
} {
  const clock = { now: 1_000_000 };
  const refreshMany = jest.fn(
    async (leases: readonly LeaseRef[]): Promise<RefreshOutcome[]> =>
      leases.map(() => 'ok' as const),
  );
  const onOutcomes = jest.fn();
  const refresher = new LeaseRefresher({
    quota: { refreshMany },
    leaseMs: LEASE_MS,
    refreshMs: REFRESH_MS,
    maxBatch: options.maxBatch,
    now: () => clock.now,
    // 0.5 → hệ số jitter đúng bằng 1,0 nên mốc thời gian tính được chính xác.
    random: options.random ?? (() => 0.5),
    onOutcomes,
  });
  return { refresher, refreshMany, onOutcomes, clock };
}

describe('LeaseRefresher', () => {
  it('lần đầu rải trong [0,3 ; 1,0] chu kỳ — không gia hạn trước mốc đó', async () => {
    const early = setup({ random: () => 0 });
    early.refresher.add('lease-1', 'user-1', jest.fn());
    early.clock.now += 0.3 * REFRESH_MS - 1;
    await early.refresher.tick();
    expect(early.refreshMany).not.toHaveBeenCalled();
    early.clock.now += 1;
    await early.refresher.tick();
    expect(early.refreshMany).toHaveBeenCalledTimes(1);

    const late = setup({ random: () => 1 });
    late.refresher.add('lease-1', 'user-1', jest.fn());
    late.clock.now += REFRESH_MS - 1;
    await late.refresher.tick();
    expect(late.refreshMany).not.toHaveBeenCalled();
    late.clock.now += 1;
    await late.refresher.tick();
    expect(late.refreshMany).toHaveBeenCalledTimes(1);
  });

  it('gom mọi lease đến hạn vào MỘT lần gọi refreshMany và đặt lịch chu kỳ kế tiếp', async () => {
    const { refresher, refreshMany, onOutcomes, clock } = setup();
    refresher.add('lease-1', 'user-1', jest.fn());
    refresher.add('lease-2', 'user-2', jest.fn());
    clock.now += REFRESH_MS;

    await refresher.tick();

    expect(refreshMany).toHaveBeenCalledTimes(1);
    expect(refreshMany).toHaveBeenCalledWith([
      { userId: 'user-1', leaseId: 'lease-1' },
      { userId: 'user-2', leaseId: 'lease-2' },
    ]);
    expect(onOutcomes).toHaveBeenCalledWith('ok', 2);
    clock.now += REFRESH_MS - 1;
    await refresher.tick();
    expect(refreshMany).toHaveBeenCalledTimes(1); // chưa tới chu kỳ sau
    clock.now += 1;
    await refresher.tick();
    expect(refreshMany).toHaveBeenCalledTimes(2);
  });

  it('Redis báo lease đã mất → gọi onExpired ngay và ngừng theo dõi', async () => {
    const { refresher, refreshMany, clock } = setup();
    const onExpired = jest.fn();
    refresher.add('lease-1', 'user-1', onExpired);
    refreshMany.mockResolvedValueOnce(['lost']);
    clock.now += REFRESH_MS;

    await refresher.tick();

    expect(onExpired).toHaveBeenCalledTimes(1);
    expect(refresher.size).toBe(0);
  });

  it('Redis lỗi trước hạn lease → giữ socket và thử lại dày hơn; hết hạn thì mới ngắt', async () => {
    const { refresher, refreshMany, clock, onOutcomes } = setup();
    const onExpired = jest.fn();
    refresher.add('lease-1', 'user-1', onExpired);
    refreshMany.mockResolvedValue(['error']);
    const start = clock.now;

    // Lần lỗi đầu ở mốc 30s (< 85s = 90s − biên an toàn 5s): chưa ngắt.
    clock.now = start + REFRESH_MS;
    await refresher.tick();
    expect(onExpired).not.toHaveBeenCalled();
    expect(onOutcomes).toHaveBeenCalledWith('error', 1);

    // Thử lại mỗi ~5s thay vì chờ cả chu kỳ 30s.
    clock.now += 5_000;
    await refresher.tick();
    expect(refreshMany).toHaveBeenCalledTimes(2);

    // Tới sát hạn lease vẫn lỗi → ngắt trước khi Redis có thể cấp lại slot.
    clock.now = start + 84_999;
    await refresher.tick();
    expect(onExpired).not.toHaveBeenCalled();
    clock.now = start + 85_000;
    await refresher.tick();
    expect(onExpired).toHaveBeenCalledTimes(1);
    expect(refresher.size).toBe(0);
  });

  it('một lần gia hạn thành công đẩy mốc hết hạn đi tiếp', async () => {
    const { refresher, refreshMany, clock } = setup();
    const onExpired = jest.fn();
    refresher.add('lease-1', 'user-1', onExpired);
    const start = clock.now;
    clock.now = start + REFRESH_MS;
    await refresher.tick(); // ok: validUntil = start + 30s + 90s

    refreshMany.mockResolvedValue(['error']);
    clock.now = start + 2 * REFRESH_MS;
    await refresher.tick();
    clock.now = start + 114_000; // < 120s − 5s
    await refresher.tick();
    expect(onExpired).not.toHaveBeenCalled();
    clock.now = start + 115_000;
    await refresher.tick();
    expect(onExpired).toHaveBeenCalledTimes(1);
  });

  it('refreshMany ném lỗi → coi mọi lease là lỗi chứ không ngắt ngay', async () => {
    const { refresher, refreshMany, clock } = setup();
    const onExpired = jest.fn();
    refresher.add('lease-1', 'user-1', onExpired);
    refreshMany.mockRejectedValueOnce(new Error('redis down'));
    clock.now += REFRESH_MS;

    await expect(refresher.tick()).resolves.toBeUndefined();

    expect(onExpired).not.toHaveBeenCalled();
    expect(refresher.size).toBe(1);
  });

  it('lease bị gỡ trong lúc chờ Redis → không callback, không crash', async () => {
    const { refresher, refreshMany, clock } = setup();
    const onExpired = jest.fn();
    refresher.add('lease-1', 'user-1', onExpired);
    let reply!: (outcomes: RefreshOutcome[]) => void;
    refreshMany.mockReturnValueOnce(
      new Promise<RefreshOutcome[]>((resolve) => (reply = resolve)),
    );
    clock.now += REFRESH_MS;

    const pending = refresher.tick();
    refresher.remove('lease-1');
    reply(['lost']);
    await pending;

    expect(onExpired).not.toHaveBeenCalled();
  });

  it('mỗi tick chỉ xử lý tối đa maxBatch lease, phần còn lại để tick sau', async () => {
    const { refresher, refreshMany, clock } = setup({ maxBatch: 2 });
    for (let index = 0; index < 5; index += 1) {
      refresher.add(`lease-${index}`, `user-${index}`, jest.fn());
    }
    clock.now += REFRESH_MS;

    await refresher.tick();
    expect(refreshMany.mock.calls[0][0]).toHaveLength(2);
    await refresher.tick();
    expect(refreshMany.mock.calls[1][0]).toHaveLength(2);
    await refresher.tick();
    expect(refreshMany.mock.calls[2][0]).toHaveLength(1);
  });

  it('tick không chạy chồng nhau khi Redis chậm', async () => {
    const { refresher, refreshMany, clock } = setup();
    refresher.add('lease-1', 'user-1', jest.fn());
    let reply!: (outcomes: RefreshOutcome[]) => void;
    refreshMany.mockReturnValueOnce(
      new Promise<RefreshOutcome[]>((resolve) => (reply = resolve)),
    );
    clock.now += REFRESH_MS;

    const first = refresher.tick();
    await refresher.tick(); // bị bỏ qua vì tick trước còn đang chờ
    reply(['ok']);
    await first;

    expect(refreshMany).toHaveBeenCalledTimes(1);
  });
});

describe('LeaseRefresher — mốc ngắt độc lập, cấp lại lease, lỗi callback', () => {
  function setup2() {
    const clock = { now: 1_000_000 };
    const refreshMany = jest.fn(
      async (leases: readonly LeaseRef[]): Promise<RefreshOutcome[]> =>
        leases.map(() => 'ok' as const),
    );
    const reacquireMany = jest.fn(
      async (leases: readonly LeaseRef[]): Promise<RefreshOutcome[]> =>
        leases.map(() => 'ok' as const),
    );
    const onOutcomes = jest.fn();
    const onError = jest.fn();
    const refresher = new LeaseRefresher({
      quota: { refreshMany, reacquireMany },
      leaseMs: LEASE_MS,
      refreshMs: REFRESH_MS,
      now: () => clock.now,
      random: () => 0.5,
      onOutcomes,
      onError,
    });
    return {
      refresher,
      refreshMany,
      reacquireMany,
      onOutcomes,
      onError,
      clock,
    };
  }

  it('sweepExpired ngắt socket đúng mốc dù tick gia hạn vẫn đang treo chờ Redis', async () => {
    const { refresher, refreshMany, clock } = setup2();
    const onExpired = jest.fn();
    refresher.add('lease-1', 'user-1', onExpired);
    const start = clock.now;
    refreshMany.mockReturnValueOnce(new Promise(() => undefined)); // Redis treo
    clock.now = start + REFRESH_MS;
    void refresher.tick(); // không await: tick kẹt ở refreshMany

    clock.now = start + 84_999;
    refresher.sweepExpired();
    expect(onExpired).not.toHaveBeenCalled();
    clock.now = start + 85_000; // 90s − biên an toàn 5s
    refresher.sweepExpired();

    expect(onExpired).toHaveBeenCalledTimes(1);
    expect(refresher.size).toBe(0);
    refresher.sweepExpired(); // không gọi lại
    expect(onExpired).toHaveBeenCalledTimes(1);
  });

  it('biên an toàn luôn ≥ 2 tick: lease ngắn nhất (10s) vẫn ngắt trước hạn ít nhất 2 giây', () => {
    const clock = { now: 0 };
    const refresher = new LeaseRefresher({
      quota: { refreshMany: jest.fn(async () => []) },
      leaseMs: 10_000,
      refreshMs: 3_333,
      now: () => clock.now,
    });
    const onExpired = jest.fn();
    refresher.add('lease-1', 'user-1', onExpired);

    clock.now = 7_999;
    refresher.sweepExpired();
    expect(onExpired).not.toHaveBeenCalled();
    clock.now = 8_000;
    refresher.sweepExpired();
    expect(onExpired).toHaveBeenCalledTimes(1);
  });

  it('Redis báo lost nhưng cấp lại được (mất dữ liệu Redis) → giữ socket và đếm reacquired', async () => {
    const { refresher, refreshMany, reacquireMany, onOutcomes, clock } =
      setup2();
    const onExpired = jest.fn();
    refresher.add('lease-1', 'user-1', onExpired);
    refreshMany.mockResolvedValueOnce(['lost']);
    clock.now += REFRESH_MS;

    await refresher.tick();

    expect(reacquireMany).toHaveBeenCalledWith([
      { userId: 'user-1', leaseId: 'lease-1' },
    ]);
    expect(onExpired).not.toHaveBeenCalled();
    expect(refresher.size).toBe(1);
    expect(onOutcomes).toHaveBeenCalledWith('reacquired', 1);
    expect(onOutcomes).not.toHaveBeenCalledWith('lost', expect.anything());
  });

  it('hết slot (cấp lại cũng lost) → ngắt socket', async () => {
    const { refresher, refreshMany, reacquireMany, clock } = setup2();
    const onExpired = jest.fn();
    refresher.add('lease-1', 'user-1', onExpired);
    refreshMany.mockResolvedValueOnce(['lost']);
    reacquireMany.mockResolvedValueOnce(['lost']);
    clock.now += REFRESH_MS;

    await refresher.tick();

    expect(onExpired).toHaveBeenCalledTimes(1);
    expect(refresher.size).toBe(0);
  });

  it('cấp lại gặp lỗi Redis → coi như error (chưa ngắt ngay), không phải lost', async () => {
    const { refresher, refreshMany, reacquireMany, clock } = setup2();
    const onExpired = jest.fn();
    refresher.add('lease-1', 'user-1', onExpired);
    refreshMany.mockResolvedValueOnce(['lost']);
    reacquireMany.mockRejectedValueOnce(new Error('redis down'));
    clock.now += REFRESH_MS;

    await refresher.tick();

    expect(onExpired).not.toHaveBeenCalled();
    expect(refresher.size).toBe(1);
  });

  it('không cấp lại lease của socket đã disconnect trong lúc chờ Redis (tránh lease ma)', async () => {
    const { refresher, refreshMany, reacquireMany, clock } = setup2();
    refresher.add('lease-1', 'user-1', jest.fn());
    let reply!: (outcomes: RefreshOutcome[]) => void;
    refreshMany.mockReturnValueOnce(
      new Promise<RefreshOutcome[]>((resolve) => (reply = resolve)),
    );
    clock.now += REFRESH_MS;

    const pending = refresher.tick();
    refresher.remove('lease-1');
    reply(['lost']);
    await pending;

    expect(reacquireMany).not.toHaveBeenCalled();
  });

  it('một callback onExpired ném lỗi không làm các socket còn lại mất theo dõi', async () => {
    const { refresher, refreshMany, reacquireMany, onError, clock } = setup2();
    const second = jest.fn();
    refresher.add('lease-1', 'user-1', () => {
      throw new Error('disconnect lỗi');
    });
    refresher.add('lease-2', 'user-2', second);
    refreshMany.mockResolvedValueOnce(['lost', 'lost']);
    reacquireMany.mockResolvedValueOnce(['lost', 'lost']);
    clock.now += REFRESH_MS;

    await refresher.tick();

    expect(second).toHaveBeenCalledTimes(1);
    expect(onError).toHaveBeenCalledTimes(1);
    expect(refresher.size).toBe(0);
  });

  it('timer: lỗi bất ngờ trong tick được báo qua onError thay vì thành unhandled rejection', async () => {
    jest.useFakeTimers();
    try {
      const { refresher, refreshMany, onOutcomes, onError, clock } = setup2();
      refresher.add('lease-1', 'user-1', jest.fn());
      onOutcomes.mockImplementation(() => {
        throw new Error('metric hỏng');
      });
      refreshMany.mockResolvedValue(['ok']);
      // đưa entry tới hạn gia hạn (đồng hồ của refresher là `clock`, không phải đồng hồ giả của jest)
      clock.now += REFRESH_MS;
      refresher.start();
      await jest.advanceTimersByTimeAsync(1_000);

      expect(onError).toHaveBeenCalled();
      refresher.stop();
    } finally {
      jest.useRealTimers();
    }
  });
});
