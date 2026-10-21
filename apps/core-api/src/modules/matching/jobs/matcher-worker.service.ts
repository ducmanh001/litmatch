import {
  Inject,
  Injectable,
  Logger,
  OnApplicationBootstrap,
  OnApplicationShutdown,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { SchedulerRegistry } from '@nestjs/schedule';
import { InjectDataSource } from '@nestjs/typeorm';
import { RealtimeEvents } from '@litmatch/common-dtos';
import { withSpan } from '@litmatch/observability';
import { DataSource, In } from 'typeorm';

import { publishRealtimeEvent } from '../../../common/realtime/publish-realtime';
import { ManagedInterval } from '../../../common/scheduling/managed-interval';
import {
  MatchTicket,
  MatchTicketStatus,
  genderPreferenceAllows,
} from '../entities/match-ticket.entity';
import {
  MatchSession,
  MatchSessionStatus,
} from '../entities/match-session.entity';
import { MatchingMetrics } from '../matching.metrics';
import { MATCH_INTERACTION_POLICY } from '../ports/interaction-policy';
import { MatcherWakeup } from '../matcher-wakeup';
import {
  MATCHING_QUEUE,
  MATCHING_REALTIME,
  shardKeyOfTicket,
  ticketScore,
} from '../redis/matching-redis.provider';
import { User, UserStatus } from '../../user';
import { NotificationService, NotificationType } from '../../notification';

import type {
  MatchConfirmedEventData,
  RealtimeEnvelope,
} from '@litmatch/common-dtos';
import type { Notification } from '../../notification';
import type { CoreApiEnv } from '../../../config/env.validation';
import type { MatchInteractionPolicy } from '../ports/interaction-policy';
import type { RealtimePublisherPort } from '../../../common/realtime/realtime-publisher.port';
import type { MatchingQueuePort } from '../ports/matching-queue.port';

const MATCHER_JOB = 'matching-matcher';
const MATCHER_WAKE_DEBOUNCE_MS = 50;
const MATCHER_WAKE_MAX_DELAY_MS = 250;
/** Không để sustained enqueue biến wake-up thành một tight polling loop. */
const MATCHER_WAKE_MIN_INTERVAL_MS = 1_000;

interface PoppedTicket {
  id: string;
  score: number;
}

/**
 * - `matched`: tạo được 1 session.
 * - `progress`: không ghép nhưng trạng thái shard đã đổi (gỡ ticket hỏng/đổi giữa chừng) — thử tiếp.
 * - `contended`: matcher khác lấy mất một ticket của cặp đã chọn — nhìn lại cửa sổ mới.
 * - `stalled`: cửa sổ đầu shard không có cặp hợp lệ — dừng shard này trong tick hiện tại.
 */
export type WindowOutcome = 'matched' | 'progress' | 'contended' | 'stalled';

/**
 * Số lần `canPair` CHƯA có trong cache (vài query mỗi lần) tối đa cho một cửa sổ khi nhiều cặp liên
 * tục bị block/report. Cặp đã biết là không ghép được nằm trong cache nên không tốn lượt này.
 */
const MAX_CAN_PAIR_CHECKS = 4;
/** Số cặp tối đa trong cache cặp-không-ghép-được (TTL: `MATCHING_MATCHER_UNPAIRABLE_CACHE_MS`). */
const UNPAIRABLE_CACHE_MAX = 10_000;
/** Số lần chạy lại liên tiếp trong một lần giữ khoá exclusive trước khi nhường (backlog nặng). */
const MAX_RERUN_ROUNDS = 4;
/** Giá trị `runExclusive` trả về khi tick khác đang chạy (khác mọi số cặp ghép hợp lệ). */
const BUSY_TICK = -1;

/**
 * Matcher worker (docs/services/matching-service.md § 2-3, docs/03 § 3.8.B) — stateless,
 * chạy được nhiều instance song song:
 * - `claimPair` atomic (Lua trên Redis đơn luồng) → 2 instance không bao giờ lấy trùng ticket.
 * - Redis KHÔNG phải nguồn sự thật: verify lại Postgres trong 1 transaction SELECT FOR UPDATE
 *   (còn queued, không cùng user, user chưa bị ban, không block/report lẫn nhau — chính là
 *   "xác minh lại đúng thời điểm hành động", docs/10 § 10.0.C).
 * - Ticket verify fail còn queued → expire; ticket hợp lệ không được chọn nằm yên trong Redis với
 *   ĐÚNG score gốc (cửa sổ ứng viên chỉ đọc), nên không mất lượt chờ và không có churn pop/requeue.
 * Interval lấy từ config nên đăng ký qua SchedulerRegistry (decorator @Interval không nhận
 * được giá trị từ ConfigService lúc class được định nghĩa) — cùng pattern OutboxRelayService.
 */
@Injectable()
export class MatcherWorkerService
  implements OnApplicationBootstrap, OnApplicationShutdown
{
  private readonly logger = new Logger(MatcherWorkerService.name);
  private readonly job = new ManagedInterval();
  private wakeTimer: NodeJS.Timeout | undefined;
  private wakeDeadlineTimer: NodeJS.Timeout | undefined;
  private unsubscribeWakeup: (() => void) | undefined;
  private lastWakeRunAt = 0;
  /** Có wake-up/ticket mới đến khi một tick đang chạy: tick đó phải chạy lại ngay khi xong. */
  private rerunRequested = false;
  /** Cặp (userId nhỏ|lớn) → mốc hết hạn của kết luận "không ghép được" (block/report/cooldown). */
  private readonly unpairable = new Map<string, number>();

  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly config: ConfigService<CoreApiEnv, true>,
    private readonly scheduler: SchedulerRegistry,
    @Inject(MATCHING_QUEUE) private readonly queue: MatchingQueuePort,
    @Inject(MATCHING_REALTIME)
    private readonly realtime: RealtimePublisherPort,
    @Inject(MATCH_INTERACTION_POLICY)
    private readonly interactionPolicy: MatchInteractionPolicy,
    private readonly metrics: MatchingMetrics,
    private readonly notificationService: NotificationService,
    private readonly matcherWakeup: MatcherWakeup,
  ) {}

  onApplicationBootstrap(): void {
    this.unsubscribeWakeup = this.matcherWakeup.subscribe(() =>
      this.scheduleWakeRun(),
    );
    this.job.start(this.scheduler, {
      jobName: MATCHER_JOB,
      intervalMs: this.config.getOrThrow('MATCHING_MATCHER_INTERVAL_MS', {
        infer: true,
      }),
      task: () => this.runOnce(),
      logger: this.logger,
      errorMessage: 'Matcher tick lỗi',
      // Matching is event-driven; this interval is only an idle-safe backstop.
      skipWhenIdle: true,
      // Enqueue wake-up vẫn chạy song song theo pod; chỉ backstop định kỳ cần một replica.
      clusterSingleton: { dataSource: this.dataSource },
    });
  }

  onApplicationShutdown(): void {
    this.job.stop();
    this.unsubscribeWakeup?.();
    this.unsubscribeWakeup = undefined;
    if (this.wakeTimer) {
      clearTimeout(this.wakeTimer);
      this.wakeTimer = undefined;
    }
    if (this.wakeDeadlineTimer) {
      clearTimeout(this.wakeDeadlineTimer);
      this.wakeDeadlineTimer = undefined;
    }
  }

  /** Gom enqueue liên tiếp thành batch, nhưng không trì hoãn vô hạn khi traffic liên tục. */
  private scheduleWakeRun(): void {
    if (!this.wakeDeadlineTimer) {
      this.wakeDeadlineTimer = setTimeout(
        () => this.runScheduledWake(),
        MATCHER_WAKE_MAX_DELAY_MS,
      );
      this.wakeDeadlineTimer.unref();
    }
    if (this.wakeTimer) clearTimeout(this.wakeTimer);
    this.wakeTimer = setTimeout(
      () => this.runScheduledWake(),
      MATCHER_WAKE_DEBOUNCE_MS,
    );
    this.wakeTimer.unref();
  }

  private runScheduledWake(): void {
    const notBefore =
      this.lastWakeRunAt + MATCHER_WAKE_MIN_INTERVAL_MS - Date.now();
    if (notBefore > 0) {
      if (this.wakeTimer) clearTimeout(this.wakeTimer);
      if (this.wakeDeadlineTimer) clearTimeout(this.wakeDeadlineTimer);
      this.wakeDeadlineTimer = undefined;
      this.wakeTimer = setTimeout(() => this.runScheduledWake(), notBefore);
      this.wakeTimer.unref();
      return;
    }
    if (this.wakeTimer) {
      clearTimeout(this.wakeTimer);
      this.wakeTimer = undefined;
    }
    if (this.wakeDeadlineTimer) {
      clearTimeout(this.wakeDeadlineTimer);
      this.wakeDeadlineTimer = undefined;
    }
    this.lastWakeRunAt = Date.now();
    void this.runOnce().catch((error: unknown) =>
      this.logger.error({ err: `${error}` }, 'Matcher wake-up lỗi'),
    );
  }

  /**
   * 1 tick — public để test/chạy tay. Trả về số cặp ghép được.
   *
   * Wake-up đến khi một tick đang chạy KHÔNG bị bỏ: ticket vừa vào hàng đợi có thể nằm ở shard tick
   * đó đã xử lý xong, và nếu bỏ thì nó phải chờ wake-up kế tiếp hoặc backstop vài giây. Tick đang chạy
   * thấy cờ `rerunRequested` thì chạy lại ngay khi xong (tối đa `MAX_RERUN_ROUNDS` vòng liên tiếp).
   */
  async runOnce(): Promise<number> {
    const matched = await this.job.runExclusive(async () => {
      let total = 0;
      for (let round = 0; round < MAX_RERUN_ROUNDS; round += 1) {
        this.rerunRequested = false;
        const roundMatched = await this.runRound();
        total += roundMatched;
        if (!this.rerunRequested) break;
      }
      return total;
    }, BUSY_TICK);
    if (matched === BUSY_TICK) {
      this.rerunRequested = true;
      return 0;
    }
    return matched;
  }

  private runRound(): Promise<number> {
    // Tick chạy ngoài context 1 HTTP request nên không có parent span tự nhiên — bọc thủ công
    // để DB/Redis bên trong (drainShard/matchWindow) trở thành child span trong CÙNG 1 trace
    // (docs/07 GĐ6 — distributed tracing Matching → Calling → Economy, xem
    // libs/observability/src/lib/traced.ts).
    return withSpan(
      'litmatch.matching',
      'matching.matcher.tick',
      async (span) => {
        const shards = shuffled(await this.queue.listActiveShards());
        const workers = Math.min(this.effectiveConcurrency(), shards.length);
        let next = 0;
        let matched = 0;
        // Các shard có ticket rời nhau nên drain song song không tranh lock; số worker bị chặn
        // theo pool Postgres để matcher không chiếm hết kết nối của request thường.
        const results = await Promise.allSettled(
          Array.from({ length: workers }, async () => {
            while (next < shards.length) {
              // Không viết `matched += await ...`: vế trái được đọc TRƯỚC khi await nên hai worker
              // chạy xen kẽ sẽ ghi đè kết quả của nhau.
              const drained = await this.drainShard(shards[next++]);
              matched += drained;
            }
          }),
        );
        span.setAttribute('matching.matched_pairs', matched);
        const failed = results.find(
          (result): result is PromiseRejectedResult =>
            result.status === 'rejected',
        );
        if (failed) throw failed.reason;
        return matched;
      },
    );
  }
  /**
   * Số shard drain song song. Mỗi cặp giữ tối đa 1 kết nối cho transaction và 1 kết nối ngắn cho
   * đọc/`canPair`, nên chỉ dùng tối đa 1/4 pool cho matcher.
   */
  private effectiveConcurrency(): number {
    const configured = this.config.getOrThrow('MATCHING_MATCHER_CONCURRENCY', {
      infer: true,
    });
    const poolMax = this.config.getOrThrow('DATABASE_POOL_MAX', {
      infer: true,
    });
    return Math.max(1, Math.min(configured, Math.floor(poolMax / 4)));
  }

  private async drainShard(shard: string): Promise<number> {
    const batchSize = this.config.getOrThrow('MATCHING_MATCHER_BATCH_SIZE', {
      infer: true,
    });
    const windowSize = this.config.getOrThrow(
      'MATCHING_MATCHER_CANDIDATE_WINDOW',
      { infer: true },
    );
    let matched = 0;
    for (let i = 0; i < batchSize; i++) {
      const window = await this.queue.peekWindow(shard, windowSize);
      if (window.length === 0) {
        await this.cleanupShardIfEmpty(shard);
        break;
      }
      // Chỉ còn 1 ticket: không động vào — chờ người tiếp theo (không pop rồi trả lại như trước).
      if (window.length < 2) break;
      const outcome = await this.matchWindow(shard, window);
      this.metrics.observeWindow(outcome);
      if (outcome === 'matched') matched += 1;
      // `stalled`: không có cặp hợp lệ nào trong cửa sổ đầu shard. Nhìn lại sẽ thấy đúng cửa sổ
      // đó → busy-loop. Thử lại khi có ticket chen vào cửa sổ hoặc sweeper expire ticket quá hạn.
      if (outcome === 'stalled') break;
    }
    return matched;
  }

  /**
   * Chọn cặp ưu tiên cao nhất trong cửa sổ đầu shard rồi ghép trong 1 transaction Postgres.
   *
   * Cặp 2 ticket đầu shard không khớp (preference giới tính, block/report) KHÔNG còn chặn cả shard:
   * ticket cũ nhất tìm đối tác tương thích đầu tiên trong cửa sổ `MATCHING_MATCHER_CANDIDATE_WINDOW`.
   * Cửa sổ chỉ ĐỌC (không lấy ticket ra khỏi Redis); chỉ cặp được chọn bị lấy bằng `claimPair`
   * atomic. Verify lại trạng thái DB dưới `SELECT ... FOR UPDATE` ngay trước khi tạo session —
   * Redis không phải nguồn sự thật (spec § 2, docs/10 § 10.0.C).
   */
  private async matchWindow(
    shard: string,
    window: Array<[string, string]>,
  ): Promise<WindowOutcome> {
    const poppedById = new Map<string, PoppedTicket>(
      window.map(([id, score]) => [id, { id, score: Number(score) }]),
    );
    const { manager } = this.dataSource;
    const tickets = await manager.find(MatchTicket, {
      where: { id: In([...poppedById.keys()]) },
    });
    const ticketById = new Map(tickets.map((t) => [t.id, t]));
    const userIds = [...new Set(tickets.map((t) => t.userId))];
    // Chỉ cần id/status/gender: mỗi lần xét đọc tới cả cửa sổ ticket × user, đọc nguyên hàng user
    // (kể cả cột jsonb) ở tốc độ ghép cao điểm là lãng phí băng thông DB.
    const users =
      userIds.length > 0
        ? await manager.find(User, {
            where: { id: In(userIds) },
            select: { id: true, status: true, gender: true },
          })
        : [];
    const userById = new Map(users.map((u) => [u.id, u]));

    // Phân loại theo thứ tự ưu tiên của Redis:
    // - còn hợp lệ → ứng viên;
    // - đã rời 'queued' (cancelled/expired/matched bởi luồng khác) hoặc không còn trong DB → chỉ gỡ khỏi Redis;
    // - vẫn 'queued' nhưng user không còn active (vd vừa bị ban) → expire (queued→expired hợp lệ).
    const candidates: MatchTicket[] = [];
    const dropIds: string[] = [];
    const expireIds: string[] = [];
    for (const [id] of window) {
      const ticket = ticketById.get(id);
      if (!ticket || ticket.status !== MatchTicketStatus.Queued) {
        dropIds.push(id);
      } else if (userById.get(ticket.userId)?.status !== UserStatus.Active) {
        expireIds.push(id);
      } else {
        candidates.push(ticket);
      }
    }
    await this.discard(shard, dropIds, expireIds);
    const discarded = dropIds.length + expireIds.length > 0;

    const pair = await this.findPair(candidates, userById);
    if (!pair) return discarded ? 'progress' : 'stalled';

    if (!(await this.queue.claimPair(shard, pair[0].id, pair[1].id))) {
      return 'contended'; // matcher khác vừa lấy một trong hai — nhìn lại cửa sổ mới
    }
    return this.confirmPair(shard, pair, poppedById);
  }

  /**
   * Cặp tương thích đầu tiên theo thứ tự ưu tiên: ticket i (cũ nhất) × ticket j (j > i, cũ nhất có
   * thể). Gender lọc 2 chiều bằng gender đọc TƯƠI từ `users` (docs/01 #13); `canPair`
   * (block/report, docs/10 § 10.0.C) chỉ chạy cho cặp đã qua gender và tối đa
   * `MAX_CAN_PAIR_CHECKS` lần mỗi cửa sổ.
   */
  private async findPair(
    candidates: readonly MatchTicket[],
    userById: ReadonlyMap<string, User>,
  ): Promise<[MatchTicket, MatchTicket] | undefined> {
    let canPairChecks = 0;
    for (let i = 0; i < candidates.length; i++) {
      for (let j = i + 1; j < candidates.length; j++) {
        const a = candidates[i];
        const b = candidates[j];
        if (a.userId === b.userId) continue;
        if (
          !genderPreferenceAllows(
            a.genderPreference,
            userById.get(b.userId)?.gender,
          ) ||
          !genderPreferenceAllows(
            b.genderPreference,
            userById.get(a.userId)?.gender,
          )
        ) {
          continue;
        }
        if (this.isKnownUnpairable(a.userId, b.userId)) continue;
        if (canPairChecks >= MAX_CAN_PAIR_CHECKS) return undefined;
        canPairChecks += 1;
        if (await this.interactionPolicy.canPair(a.userId, b.userId)) {
          return [a, b];
        }
        this.rememberUnpairable(a.userId, b.userId);
      }
    }
    return undefined;
  }

  private static pairKey(a: string, b: string): string {
    return a < b ? `${a}|${b}` : `${b}|${a}`;
  }

  private unpairableCacheMs(): number {
    return this.config.getOrThrow('MATCHING_MATCHER_UNPAIRABLE_CACHE_MS', {
      infer: true,
    });
  }

  private isKnownUnpairable(a: string, b: string): boolean {
    if (this.unpairableCacheMs() <= 0) return false;
    const key = MatcherWorkerService.pairKey(a, b);
    const expiresAt = this.unpairable.get(key);
    if (expiresAt === undefined) return false;
    if (expiresAt <= Date.now()) {
      this.unpairable.delete(key);
      return false;
    }
    return true;
  }

  private rememberUnpairable(a: string, b: string): void {
    const ttlMs = this.unpairableCacheMs();
    if (ttlMs <= 0) return;
    if (this.unpairable.size >= UNPAIRABLE_CACHE_MAX) {
      const now = Date.now();
      for (const [key, expiresAt] of this.unpairable) {
        if (expiresAt <= now) this.unpairable.delete(key);
      }
      if (this.unpairable.size >= UNPAIRABLE_CACHE_MAX) {
        const oldest = this.unpairable.keys().next();
        if (!oldest.done) this.unpairable.delete(oldest.value);
      }
    }
    this.unpairable.set(MatcherWorkerService.pairKey(a, b), Date.now() + ttlMs);
  }

  /** Gỡ ticket không còn ghép được khỏi Redis (DB trước, Redis sau — Redis lỗi chỉ để lại zombie bị loại ở lần sau). */
  private async discard(
    shard: string,
    dropIds: readonly string[],
    expireIds: readonly string[],
  ): Promise<void> {
    if (expireIds.length > 0) {
      await this.dataSource.manager.update(
        MatchTicket,
        { id: In([...expireIds]), status: MatchTicketStatus.Queued },
        { status: MatchTicketStatus.Expired },
      );
    }
    await Promise.all(
      [...dropIds, ...expireIds].map((id) => this.queue.remove(shard, id)),
    );
  }

  /**
   * Cặp đã được `claimPair` lấy khỏi Redis → verify lại DB dưới lock + queued→confirmed + tạo
   * `MatchSession` đã sẵn sàng trong 1 transaction Postgres (spec § 2).
   */
  private async confirmPair(
    shard: string,
    pair: readonly [MatchTicket, MatchTicket],
    poppedById: ReadonlyMap<string, PoppedTicket>,
  ): Promise<WindowOutcome> {
    const pairIds = pair.map((ticket) => ticket.id);
    const attempt = this.dataSource.transaction(async (manager) => {
      const tickets = await manager.find(MatchTicket, {
        where: { id: In(pairIds) },
        order: { id: 'ASC' }, // thứ tự lock cố định — tránh deadlock với các writer khác
        lock: { mode: 'pessimistic_write' },
      });
      const byId = new Map(tickets.map((t) => [t.id, t]));
      const ta = byId.get(pair[0].id);
      const tb = byId.get(pair[1].id);

      const userIds = [...new Set(tickets.map((t) => t.userId))];
      const users =
        userIds.length > 0
          ? await manager.find(User, { where: { id: In(userIds) } })
          : [];
      const userById = new Map(users.map((u) => [u.id, u]));
      const isValid = (t?: MatchTicket): t is MatchTicket =>
        !!t &&
        t.status === MatchTicketStatus.Queued &&
        userById.get(t.userId)?.status === UserStatus.Active;

      const aValid = isValid(ta);
      const bValid = isValid(tb);

      // Giữa lúc chọn cặp và lúc khoá row, một bên có thể vừa cancel/bị ban/đổi gender hoặc bị
      // block/report (docs/10 § 10.0.C — xác minh lại đúng thời điểm hành động). `canPair` lúc chọn
      // cặp chỉ là bộ lọc: quyết định cuối cùng nằm Ở ĐÂY, dưới lock, vì khoảng từ lúc chọn tới lúc
      // commit gồm cả thời gian chờ claim và chờ lấy kết nối pool cho transaction (tới vài giây khi
      // tải cao). `canPair` đọc qua connection khác như bản cũ; song song được chặn ≤ ¼ pool để việc
      // giữ hai kết nối cùng lúc không tự làm cạn pool.
      if (
        aValid &&
        bValid &&
        ta.userId !== tb.userId &&
        genderPreferenceAllows(
          ta.genderPreference,
          userById.get(tb.userId)?.gender,
        ) &&
        genderPreferenceAllows(
          tb.genderPreference,
          userById.get(ta.userId)?.gender,
        ) &&
        (await this.interactionPolicy.canPair(ta.userId, tb.userId))
      ) {
        const confirmedAt = new Date();
        const session = await manager.save(
          manager.create(MatchSession, {
            matchType: ta.matchType,
            userAId: ta.userId,
            userBId: tb.userId,
            ticketAId: ta.id,
            ticketBId: tb.id,
            status: MatchSessionStatus.Confirmed,
            confirmedAAt: confirmedAt,
            confirmedBAt: confirmedAt,
          }),
        );
        // Một UPDATE có điều kiện thay cho 2 lần save entity (mỗi lần kèm SELECT): hai ticket đã
        // được lock và verify 'queued' nên affected luôn là 2; điều kiện status là chốt chặn thứ hai.
        const updated = await manager.update(
          MatchTicket,
          { id: In([ta.id, tb.id]), status: MatchTicketStatus.Queued },
          { status: MatchTicketStatus.Confirmed, sessionId: session.id },
        );
        if (updated.affected !== 2) {
          throw new Error('Ghép cặp: ticket đổi trạng thái dưới lock');
        }
        const matchNotifications = await Promise.all(
          [ta, tb].map((ticket) =>
            this.notificationService.createWithManager(manager, {
              userId: ticket.userId,
              type: NotificationType.MatchConfirmed,
              payload: { sessionId: session.id, matchType: ticket.matchType },
            }),
          ),
        );
        const matchedAt = Date.now();
        return {
          kind: 'matched' as const,
          requeue: [] as PoppedTicket[],
          matchedPair: [
            {
              userId: ta.userId,
              ticketId: ta.id,
              sessionId: session.id,
              matchType: ta.matchType,
              waitSeconds: (matchedAt - ta.enqueuedAt.getTime()) / 1000,
            },
            {
              userId: tb.userId,
              ticketId: tb.id,
              sessionId: session.id,
              matchType: tb.matchType,
              waitSeconds: (matchedAt - tb.enqueuedAt.getTime()) / 1000,
            },
          ],
          matchNotifications,
        };
      }

      // Không ghép được (đã đổi giữa chừng) — xử lý từng ticket đã bị claim (spec § 2):
      // - còn hợp lệ → đẩy lại Redis với score gốc, không mất lượt chờ (làm sau khi commit)
      // - verify fail nhưng vẫn 'queued' trong DB (vd user vừa bị ban) → expire (queued→expired hợp lệ)
      // - đã rời 'queued' hợp lệ → chỉ gỡ (đã bị claim khỏi Redis)
      const requeue: PoppedTicket[] = [];
      const entries: Array<[MatchTicket | undefined, boolean, string]> = [
        [ta, aValid, pair[0].id],
        [tb, bValid, pair[1].id],
      ];
      for (const [ticket, valid, id] of entries) {
        const popped = poppedById.get(id);
        if (valid && popped) {
          requeue.push(popped);
        } else if (ticket && ticket.status === MatchTicketStatus.Queued) {
          ticket.status = MatchTicketStatus.Expired;
          await manager.save(ticket);
        }
      }
      return {
        kind: 'dropped' as const,
        requeue,
        matchedPair: undefined,
        matchNotifications: [] as Notification[],
      };
    });
    const result = await attempt.catch(async (error: unknown) => {
      // Transaction lỗi (hết pool, deadlock, mất kết nối DB) SAU khi cặp đã bị claim khỏi Redis: trả
      // cả hai về hàng đợi với score gốc thay vì để thành zombie tới khi sweeper expire — dưới tải
      // lớn, lỗi lấy kết nối là chuyện thường. Nếu thực ra transaction đã commit (mất phản hồi),
      // ticket `confirmed` quay lại Redis sẽ bị `matchWindow` gỡ ở lần sau, không ghép đôi.
      await this.requeueClaimed(
        shard,
        pair.flatMap((ticket) => poppedById.get(ticket.id) ?? []),
        false,
      );
      await this.queue.markActive(shard).catch(() => undefined);
      throw error;
    });

    if (result.requeue.length > 0) {
      await this.requeueClaimed(shard, result.requeue, true);
      await this.queue.markActive(shard);
    }
    if (result.matchedPair) {
      // Matching latency (docs/07 GĐ6) — ghi cho CẢ 2 vé, mỗi bên có wait time riêng
      for (const { matchType, waitSeconds } of result.matchedPair) {
        this.metrics.observeMatched(matchType, waitSeconds);
      }
      // Realtime SAU commit — best-effort, client vẫn còn GET /matching/tickets/:id poll fallback.
      await Promise.all(
        result.matchedPair.map(({ userId, ticketId, sessionId }) => {
          const envelope: RealtimeEnvelope<MatchConfirmedEventData> = {
            event: RealtimeEvents.MatchConfirmed,
            data: { ticketId, sessionId },
          };
          return publishRealtimeEvent(
            this.realtime,
            this.logger,
            userId,
            envelope,
          );
        }),
      );
      await Promise.all(
        result.matchNotifications.map((n) =>
          this.notificationService.sendPush(n),
        ),
      );
    }
    return result.kind === 'matched' ? 'matched' : 'progress';
  }

  /**
   * Trả ticket đã bị claim về hàng đợi mà KHÔNG làm mất ưu tiên đã mua. Score đọc lúc lấy cửa sổ có thể đã cũ:
   * speed-up hoàn tất sau lúc claim chỉ ghi được DB (`ZADD XX` của nó bỏ qua vì member đang không nằm trong Redis),
   * nên trả lại bằng score cũ sẽ xoá mất lượt boost đã trả tiền. Cách làm:
   * 1. `NX` bằng score đã đọc — khôi phục sự hiện diện ngay (`NX` phòng trùng);
   * 2. đọc lại `priorityBoostMs` từ DB và đặt score TUYỆT ĐỐI bằng `XX_LT` (`ZADD XX LT`). Từ bước 1 member đã có trong
   *    Redis nên speed-up mới tự ghi đúng; speed-up đã ghi DB trước bước đọc thì được bước này bắt.
   *    Vì sao `LT` mà không chỉ `XX`: giữa bước đọc DB và lệnh Redis của bước này, một speed-up KHÁC có thể hoàn tất cả
   *    DB lẫn Redis; `XX` thuần để lệnh đến muộn (giá trị đọc cũ hơn) ghi đè score đã hạ xuống. Score chỉ có thể giảm trong
   *    đời ticket (boost chỉ tăng; enqueuedAt và trustPenalty là snapshot lúc tạo) nên `LT` chặn đúng loại ghi lỗi thời
   *    đó mà vẫn cho mọi lần hạ score hợp lệ qua, và chạy lại bao nhiêu lần cũng không boost đôi.
   * `strict`: lỗi bước 1 được ném lên (đường thường); đường lỗi transaction chỉ ghi nhận để lỗi gốc đi tiếp. Bước 2 luôn
   * best-effort: DB lỗi thì ticket giữ score đã đọc lúc claim (có thể thiếu boost vừa mua trong khoảng đó) cho tới khi
   * QueueRepairService quét lại ticket sống và refresh score từ DB; client replay cùng Idempotency-Key cũng đặt lại
   * score ngay (matching.service.ts, bước 4). Ticket-sweeper chỉ expire hoặc thêm ticket requeue MỚI bằng `NX`.
   */
  private async requeueClaimed(
    shard: string,
    claimed: readonly PoppedTicket[],
    strict: boolean,
  ): Promise<void> {
    if (claimed.length === 0) return;
    const restored = await Promise.allSettled(
      claimed.map((c) =>
        this.queue.enqueue(shard, String(c.score), c.id, 'NX'),
      ),
    );
    const failed = restored.find((r) => r.status === 'rejected');
    if (strict && failed?.status === 'rejected') throw failed.reason;
    try {
      const scoreAtRead = new Map(claimed.map((c) => [c.id, c.score]));
      const rows = await this.dataSource.manager.find(MatchTicket, {
        where: {
          id: In(claimed.map((c) => c.id)),
          status: MatchTicketStatus.Queued,
        },
      });
      await Promise.all(
        rows
          .filter((row) => ticketScore(row) !== scoreAtRead.get(row.id))
          .map((row) =>
            this.queue.enqueue(
              shardKeyOfTicket(row),
              String(ticketScore(row)),
              row.id,
              'XX_LT',
            ),
          ),
      );
    } catch (error) {
      this.logger.warn(
        `Không đọc lại được score từ DB khi trả ticket về hàng đợi: ${String(error)}`,
      );
    }
  }

  /** Dọn shard rỗng khỏi set active (spec § 2) — re-check sau SREM để không nuốt enqueue chen giữa. */
  private async cleanupShardIfEmpty(shard: string): Promise<void> {
    await this.queue.unmarkActive(shard);
    if (await this.queue.hasEntries(shard)) await this.queue.markActive(shard);
  }
}

/** Fisher–Yates: các pod/worker không cùng đập vào shard đầu tiên của cùng một danh sách. */
function shuffled<T>(items: readonly T[]): T[] {
  const copy = [...items];
  for (let index = copy.length - 1; index > 0; index -= 1) {
    const swap = Math.floor(Math.random() * (index + 1));
    [copy[index], copy[swap]] = [copy[swap], copy[index]];
  }
  return copy;
}
