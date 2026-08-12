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

type PairOutcome = 'matched' | 'requeued_pair' | 'dropped';

/**
 * Matcher worker (docs/services/matching-service.md § 2-3, docs/03 § 3.8.B) — stateless,
 * chạy được nhiều instance song song:
 * - `ZPOPMIN shard 2` atomic (Redis đơn luồng) → 2 instance không bao giờ lấy trùng ticket.
 * - Redis KHÔNG phải nguồn sự thật: verify lại Postgres trong 1 transaction SELECT FOR UPDATE
 *   (còn queued, không cùng user, user chưa bị ban, không block/report lẫn nhau — chính là
 *   "xác minh lại đúng thời điểm hành động", docs/10 § 10.0.C).
 * - Ticket verify fail còn queued → expire; ticket hợp lệ → đẩy lại Redis với ĐÚNG score đã pop
 *   (giữ nguyên priority gốc, không mất lượt chờ).
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

  /** 1 tick — public để test/chạy tay. Trả về số cặp ghép được. */
  async runOnce(): Promise<number> {
    return this.job.runExclusive(async () => {
      // Tick chạy ngoài context 1 HTTP request nên không có parent span tự nhiên — bọc thủ công
      // để DB/Redis bên trong (drainShard/tryPair) trở thành child span trong CÙNG 1 trace
      // (docs/07 GĐ6 — distributed tracing Matching → Calling → Economy, xem
      // libs/observability/src/lib/traced.ts).
      return withSpan(
        'litmatch.matching',
        'matching.matcher.tick',
        async (span) => {
          let matched = 0;
          for (const shard of await this.queue.listActiveShards()) {
            matched += await this.drainShard(shard);
          }
          span.setAttribute('matching.matched_pairs', matched);
          return matched;
        },
      );
    }, 0);
  }

  private async drainShard(shard: string): Promise<number> {
    const batchSize = this.config.getOrThrow('MATCHING_MATCHER_BATCH_SIZE', {
      infer: true,
    });
    let matched = 0;
    for (let i = 0; i < batchSize; i++) {
      // ZPOPMIN key 2: atomic — không cần Lua, 2 matcher không lấy trùng (spec § 2)
      const popped = await this.queue.popMin(shard, 2);
      if (popped.length === 0) {
        await this.cleanupShardIfEmpty(shard);
        break;
      }
      if (popped.length < 2) {
        // chỉ còn 1 ticket — trả lại đúng score cũ, chờ người tiếp theo
        await this.queue.enqueue(shard, popped[0][1], popped[0][0], 'NX');
        break;
      }
      const outcome = await this.tryPair(
        shard,
        { id: popped[0][0], score: Number(popped[0][1]) },
        { id: popped[1][0], score: Number(popped[1][1]) },
      );
      if (outcome === 'matched') matched += 1;
      // Cặp hợp lệ nhưng block/report lẫn nhau → cả 2 đã được trả lại queue với score cũ.
      // Dừng shard này trong tick hiện tại: pop tiếp sẽ lấy lại đúng cặp đó → busy-loop.
      // Họ sẽ được thử lại khi có ứng viên thứ 3, hoặc sweeper expire khi quá hạn chờ.
      if (outcome === 'requeued_pair') break;
    }
    return matched;
  }

  /**
   * Verify + transition queued→confirmed + tạo MatchSession đã sẵn sàng trong 1 transaction Postgres,
   * SELECT FOR UPDATE trên cả 2 ticket (spec § 2).
   */
  private async tryPair(
    shard: string,
    a: PoppedTicket,
    b: PoppedTicket,
  ): Promise<PairOutcome> {
    const result = await this.dataSource.transaction(async (manager) => {
      const tickets = await manager.find(MatchTicket, {
        where: { id: In([a.id, b.id]) },
        order: { id: 'ASC' }, // thứ tự lock cố định — tránh deadlock với các writer khác
        lock: { mode: 'pessimistic_write' },
      });
      const byId = new Map(tickets.map((t) => [t.id, t]));
      const ta = byId.get(a.id);
      const tb = byId.get(b.id);

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

      // Gender filter 2 CHIỀU (docs/01 #13) với gender đọc TƯƠI từ users trong chính transaction
      // này (user đổi profile giữa lúc chờ vẫn đúng — docs/10 § 10.0.C). Không khớp = cặp hợp lệ
      // nhưng không được ghép → cùng nhánh requeue với block/report, không mất lượt chờ.
      const genderOk =
        aValid &&
        bValid &&
        genderPreferenceAllows(
          ta.genderPreference,
          userById.get(tb.userId)?.gender,
        ) &&
        genderPreferenceAllows(
          tb.genderPreference,
          userById.get(ta.userId)?.gender,
        );

      if (
        aValid &&
        bValid &&
        ta.userId !== tb.userId &&
        genderOk &&
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
        ta.status = MatchTicketStatus.Confirmed;
        tb.status = MatchTicketStatus.Confirmed;
        ta.sessionId = session.id;
        tb.sessionId = session.id;
        await manager.save([ta, tb]);
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

      // Không ghép được — xử lý từng ticket (spec § 2):
      // - còn hợp lệ → đẩy lại Redis với score gốc (làm sau khi commit)
      // - verify fail nhưng vẫn 'queued' trong DB (vd user vừa bị ban) → expire (queued→expired hợp lệ)
      // - đã rời 'queued' hợp lệ (cancelled/expired/matched bởi luồng khác) → chỉ drop khỏi Redis (đã pop)
      const requeue: PoppedTicket[] = [];
      const entries: Array<[MatchTicket | undefined, boolean, PoppedTicket]> = [
        [ta, aValid, a],
        [tb, bValid, b],
      ];
      for (const [ticket, valid, poppedTicket] of entries) {
        if (valid) {
          requeue.push(poppedTicket);
        } else if (ticket && ticket.status === MatchTicketStatus.Queued) {
          ticket.status = MatchTicketStatus.Expired;
          await manager.save(ticket);
        }
      }
      return {
        kind:
          requeue.length === 2
            ? ('requeued_pair' as const)
            : ('dropped' as const),
        requeue,
        matchedPair: undefined,
        matchNotifications: [] as Notification[],
      };
    });

    if (result.requeue.length > 0) {
      for (const r of result.requeue) {
        // score gốc từ ZPOPMIN (đã gồm boost) — không mất lượt chờ (spec § 2); NX phòng trùng
        await this.queue.enqueue(shard, String(r.score), r.id, 'NX');
      }
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
    return result.kind;
  }

  /** Dọn shard rỗng khỏi set active (spec § 2) — re-check sau SREM để không nuốt enqueue chen giữa. */
  private async cleanupShardIfEmpty(shard: string): Promise<void> {
    await this.queue.unmarkActive(shard);
    if (await this.queue.hasEntries(shard)) await this.queue.markActive(shard);
  }
}
