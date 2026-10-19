import type { LeaseRef, RefreshOutcome } from './connection-quota.service';

const DEFAULT_TICK_MS = 1_000;
const DEFAULT_MAX_BATCH = 5_000;
/** Ngắt trước hạn Redis một khoảng an toàn để không giữ socket khi slot đã có thể bị cấp lại. */
const MAX_SAFETY_MARGIN_MS = 5_000;
/** Khi Redis lỗi, thử lại dày hơn chu kỳ thường để còn nhiều lần thử trước khi hết hạn lease. */
const MAX_ERROR_RETRY_MS = 5_000;

interface LeaseEntry extends LeaseRef {
  onExpired: () => void;
  nextRefreshAt: number;
  /** Mốc Redis chắc chắn đã coi lease hết hạn nếu không gia hạn được (tính từ lần OK gần nhất). */
  validUntil: number;
}

/** Kết quả đếm metric: `reacquired` = Redis báo `lost` nhưng lease được cấp lại (xem `recoverLost`). */
export type LeaseOutcomeKind = RefreshOutcome | 'reacquired';

export interface LeaseRefresherOptions {
  quota: {
    refreshMany(leases: readonly LeaseRef[]): Promise<RefreshOutcome[]>;
    /** Cấp lại lease Redis báo `lost`; bỏ qua = `lost` là kết luận cuối. */
    reacquireMany?(leases: readonly LeaseRef[]): Promise<RefreshOutcome[]>;
    /** Nhả lease đã được cấp lại cho socket không còn nữa; bỏ qua = chờ TTL (lease ma tới `leaseMs`). */
    releaseMany?(leases: readonly LeaseRef[]): Promise<void>;
  };
  leaseMs: number;
  refreshMs: number;
  tickMs?: number;
  maxBatch?: number;
  now?: () => number;
  random?: () => number;
  /** Hook đếm kết quả để xuất metric; không được throw. */
  onOutcomes?: (outcome: LeaseOutcomeKind, count: number) => void;
  /** Lỗi không lường trước trong tick hoặc trong callback `onExpired` của một socket. */
  onError?: (error: unknown) => void;
}

/**
 * Gia hạn lease cho TOÀN BỘ socket của pod bằng MỘT timer, thay vì một `setInterval` + một lệnh
 * Redis cho mỗi socket. Ở 50.000 socket/pod điều đó là 50.000 timer và 50.000 round trip mỗi
 * chu kỳ; ở đây mỗi tick (1s) chỉ gom các lease đến hạn thành vài pipeline, và pha gia hạn được
 * rải đều (jitter) để không dồn thành đợt sau một lần reconnect hàng loạt.
 *
 * An toàn lease (docs/services/realtime-gateway.md § 5):
 * - Redis báo `lost` → thử CẤP LẠI trước (lease cấp lại cho socket đã ngắt giữa chừng thì nhả ngay, xem `apply`) (Redis restart/failover mất dữ liệu làm mọi lease biến mất
 *   cùng lúc, không phải mọi socket đều hết quyền); chỉ khi không còn slot mới ngắt socket.
 * - Redis lỗi/timeout (`error`) → KHÔNG ngắt ngay; thử lại dày hơn, và chỉ ngắt khi lần gia hạn
 *   thành công cuối cùng đã đủ `leaseMs` (trừ biên an toàn). Slot chưa thể bị cấp cho socket
 *   khác trước mốc đó nên một lần Redis chớp vài giây không còn làm rớt toàn bộ socket của cả đàn
 *   pod rồi dồn reconnect vào Redis đang hồi phục.
 * - Mốc ngắt được quét ĐỘC LẬP với việc gia hạn (`sweepExpired`, mỗi tick kể cả khi tick trước còn
 *   đang chờ Redis): Redis treo vài chục giây không được kéo dài thời gian giữ socket quá hạn lease.
 */
export class LeaseRefresher {
  private readonly entries = new Map<string, LeaseEntry>();
  private readonly tickMs: number;
  private readonly maxBatch: number;
  private readonly safetyMarginMs: number;
  private readonly now: () => number;
  private readonly random: () => number;
  private timer: NodeJS.Timeout | undefined;
  private ticking = false;

  constructor(private readonly options: LeaseRefresherOptions) {
    this.tickMs = options.tickMs ?? DEFAULT_TICK_MS;
    this.maxBatch = options.maxBatch ?? DEFAULT_MAX_BATCH;
    // Biên ≥ 2 tick: quét hạn chạy mỗi tick nên có thể trễ tới một tick sau mốc.
    this.safetyMarginMs = Math.min(
      MAX_SAFETY_MARGIN_MS,
      Math.max(2 * this.tickMs, Math.floor(options.leaseMs / 10)),
    );
    this.now = options.now ?? Date.now;
    this.random = options.random ?? Math.random;
  }

  get size(): number {
    return this.entries.size;
  }

  start(): void {
    if (this.timer) return;
    this.timer = setInterval(() => {
      this.sweepExpired();
      this.tick().catch((error: unknown) => this.report(error));
    }, this.tickMs);
    this.timer.unref();
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = undefined;
  }

  /** Gọi ngay sau khi acquire thành công: lease vừa được Redis cấp với TTL `leaseMs`. */
  add(leaseId: string, userId: string, onExpired: () => void): void {
    const now = this.now();
    this.entries.set(leaseId, {
      leaseId,
      userId,
      onExpired,
      // Lần đầu rải trong [0.3, 1.0] chu kỳ: gia hạn sớm luôn an toàn, và rải rộng khi cả đàn
      // socket vừa reconnect cùng lúc.
      nextRefreshAt: now + this.options.refreshMs * (0.3 + 0.7 * this.random()),
      validUntil: now + this.options.leaseMs,
    });
  }

  remove(leaseId: string): void {
    this.entries.delete(leaseId);
  }

  /**
   * Ngắt mọi socket đã tới mốc không còn chứng minh được lease, KHÔNG phụ thuộc tick gia hạn đang
   * chờ Redis hay không. Quét toàn bộ entry mỗi tick là vài ms ở 50.000 socket/pod.
   */
  sweepExpired(): void {
    const deadline = this.now() + this.safetyMarginMs;
    const expired: LeaseEntry[] = [];
    for (const entry of this.entries.values()) {
      if (entry.validUntil <= deadline) expired.push(entry);
    }
    for (const entry of expired) this.expire(entry);
  }

  /** Public để test và để chạy tay; không bao giờ chạy chồng nhau. */
  async tick(): Promise<void> {
    if (this.ticking) return;
    this.ticking = true;
    try {
      const startedAt = this.now();
      const due: LeaseEntry[] = [];
      for (const entry of this.entries.values()) {
        if (entry.nextRefreshAt > startedAt) continue;
        due.push(entry);
        if (due.length >= this.maxBatch) break;
      }
      if (due.length === 0) return;

      let outcomes: RefreshOutcome[];
      try {
        outcomes = await this.options.quota.refreshMany(
          due.map(({ userId, leaseId }) => ({ userId, leaseId })),
        );
      } catch {
        outcomes = due.map(() => 'error');
      }
      const reacquired = await this.recoverLost(due, outcomes);
      this.apply(due, outcomes, reacquired, startedAt);
    } finally {
      this.ticking = false;
    }
  }

  /**
   * Thử cấp lại các lease `lost` còn đang được theo dõi và ghi kết quả vào `outcomes`. Trả về tập
   * chỉ số đã được cấp lại. Lease của socket đã disconnect trong lúc chờ không được cấp lại (sẽ thành
   * lease ma tới khi hết TTL).
   */
  private async recoverLost(
    due: readonly LeaseEntry[],
    outcomes: RefreshOutcome[],
  ): Promise<ReadonlySet<number>> {
    const reacquired = new Set<number>();
    const reacquire = this.options.quota.reacquireMany;
    if (!reacquire) return reacquired;
    const lostIndexes: number[] = [];
    due.forEach((entry, index) => {
      if (
        outcomes[index] === 'lost' &&
        this.entries.get(entry.leaseId) === entry
      ) {
        lostIndexes.push(index);
      }
    });
    if (lostIndexes.length === 0) return reacquired;

    let recovered: RefreshOutcome[];
    try {
      recovered = await reacquire.call(
        this.options.quota,
        lostIndexes.map((index) => ({
          userId: due[index].userId,
          leaseId: due[index].leaseId,
        })),
      );
    } catch {
      recovered = lostIndexes.map(() => 'error');
    }
    lostIndexes.forEach((index, position) => {
      const outcome = recovered[position] ?? 'error';
      outcomes[index] = outcome;
      if (outcome === 'ok') reacquired.add(index);
    });
    return reacquired;
  }

  private apply(
    due: readonly LeaseEntry[],
    outcomes: readonly RefreshOutcome[],
    reacquired: ReadonlySet<number>,
    startedAt: number,
  ): void {
    const finishedAt = this.now();
    const counts: Record<LeaseOutcomeKind, number> = {
      ok: 0,
      lost: 0,
      error: 0,
      reacquired: 0,
    };
    const expired: LeaseEntry[] = [];
    const orphaned: LeaseRef[] = [];
    due.forEach((entry, index) => {
      // Socket có thể đã disconnect (hoặc bị quét hạn) trong lúc chờ Redis — không đụng vào entry đã bị gỡ.
      if (this.entries.get(entry.leaseId) !== entry) {
        // Cấp lại theo NHIỀU lô: socket ngắt và gateway đã release TRƯỚC khi lô của nó chạy, nên lô đó vẫn cấp một
        // lease mà không ai còn giữ (slot ma + presence online giả tới hết TTL). Phải nhả lease vừa cấp.
        if (reacquired.has(index)) {
          orphaned.push({ userId: entry.userId, leaseId: entry.leaseId });
        }
        return;
      }
      const outcome = outcomes[index] ?? 'error';
      counts[reacquired.has(index) ? 'reacquired' : outcome] += 1;
      if (outcome === 'ok') {
        entry.validUntil = startedAt + this.options.leaseMs;
        entry.nextRefreshAt =
          finishedAt + this.jittered(this.options.refreshMs);
        return;
      }
      if (
        outcome === 'lost' ||
        finishedAt >= entry.validUntil - this.safetyMarginMs
      ) {
        expired.push(entry);
        return;
      }
      // Lần thử kế tiếp không được muộn hơn mốc ngắt: nếu không, socket có thể sống thêm tới một
      // chu kỳ thử lại sau khi Redis đã có thể cấp lại slot của nó.
      entry.nextRefreshAt = Math.min(
        finishedAt +
          this.jittered(Math.min(this.options.refreshMs, MAX_ERROR_RETRY_MS)),
        entry.validUntil - this.safetyMarginMs,
      );
    });
    for (const outcome of ['ok', 'reacquired', 'lost', 'error'] as const) {
      if (counts[outcome] > 0)
        this.options.onOutcomes?.(outcome, counts[outcome]);
    }
    this.releaseOrphans(orphaned);
    for (const entry of expired) this.expire(entry);
  }

  /** Nhả best-effort: lỗi chỉ để lại lease tới hết TTL, không được ảnh hưởng các socket còn lại. */
  private releaseOrphans(leases: readonly LeaseRef[]): void {
    const release = this.options.quota.releaseMany;
    if (leases.length === 0 || !release) return;
    void release
      .call(this.options.quota, leases)
      .catch((error: unknown) => this.report(error));
  }

  /** Gỡ entry rồi báo socket; một callback ném lỗi không được làm các socket còn lại mất theo dõi. */
  private expire(entry: LeaseEntry): void {
    if (this.entries.get(entry.leaseId) !== entry) return;
    this.entries.delete(entry.leaseId);
    try {
      entry.onExpired();
    } catch (error) {
      this.report(error);
    }
  }

  private report(error: unknown): void {
    try {
      this.options.onError?.(error);
    } catch {
      // báo lỗi cũng là best-effort
    }
  }

  /** ±10% quanh chu kỳ để pha gia hạn tiếp tục khuếch tán thay vì đồng bộ lại. */
  private jittered(ms: number): number {
    return Math.round(ms * (0.9 + 0.2 * this.random()));
  }
}
