import { HttpStatus, Inject, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import { DomainException } from '@litmatch/common-exceptions';
import { DataSource, Repository } from 'typeorm';

import {
  isUniqueViolation,
  violatedConstraint,
} from '../../database/postgres-errors';
import {
  DEFAULT_REGION,
  SPEEDUP_RATE_WINDOW_SECONDS,
  UNKNOWN_AGE_BAND,
  UQ_ACTIVE_USER,
  joinIdempotencyKey,
  speedupIdempotencyKey,
} from './matching.constants';
import { MatchingErrors } from './matching.errors';
import {
  GenderPreference,
  MATCH_TICKET_TRANSITIONS,
  MatchTicket,
  MatchTicketStatus,
} from './entities/match-ticket.entity';
import {
  MatchSession,
  MatchSessionStatus,
} from './entities/match-session.entity';
import {
  MATCHING_ACTIVE_SHARDS_KEY,
  MATCHING_REDIS,
  shardKeyOfTicket,
  speedupCountKey,
  ticketScore,
} from './redis/matching-redis.provider';
import { EconomyService, TransactionType } from '../economy';
import { UserService, UserStatus } from '../user';

import type { EntityManager } from 'typeorm';
import type Redis from 'ioredis';
import type { AuthenticatedUser } from '../../common/decorators/current-user.decorator';
import type { CoreApiEnv } from '../../config/env.validation';
import type { JoinQueueDto } from './dto/matching.dtos';

/**
 * Rate-limit speed-up (spec § 4): INCR + EXPIRE-lần-đầu + check-quá-giới-hạn trong 1 Lua atomic.
 * Trả -1 = vượt giới hạn (đã tự DECR lại, lượt bị chặn không tiêu slot). Chặn TRƯỚC khi trừ tiền —
 * không bao giờ trừ rồi hoàn.
 */
const SPEEDUP_RATE_LIMIT_LUA = `
local c = redis.call('INCR', KEYS[1])
if c == 1 then redis.call('EXPIRE', KEYS[1], ARGV[2]) end
if c > tonumber(ARGV[1]) then
  redis.call('DECR', KEYS[1])
  return -1
end
return c
`;

/**
 * Nghiệp vụ ticket/queue của Matching (docs/services/matching-service.md).
 * Postgres = nguồn sự thật trạng thái ticket; Redis sorted set = queue store dẫn xuất.
 * Ghép cặp nằm ở MatcherWorkerService; dọn ticket quá hạn ở TicketSweeperService.
 */
@Injectable()
export class MatchingService {
  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    @InjectRepository(MatchTicket)
    private readonly ticketRepo: Repository<MatchTicket>,
    private readonly userService: UserService,
    private readonly economy: EconomyService,
    private readonly config: ConfigService<CoreApiEnv, true>,
    @Inject(MATCHING_REDIS) private readonly redis: Redis,
  ) {}

  /**
   * Vào hàng đợi. Idempotent theo header Idempotency-Key (unique constraint DB — docs/05 § 5.10);
   * 1 user chỉ 1 ticket active — chặn bằng partial unique index, không check-rồi-insert.
   */
  async joinQueue(
    user: AuthenticatedUser,
    dto: JoinQueueDto,
    idempotencyKey: string,
  ): Promise<MatchTicket> {
    const profile = await this.userService.getByIdOrThrow(user.userId);
    if (profile.status === UserStatus.Banned) {
      throw new DomainException(
        MatchingErrors.USER_BANNED,
        'Tài khoản bị khoá, không thể vào hàng đợi',
        HttpStatus.FORBIDDEN,
      );
    }

    // region/ageBand server tự derive từ profile — không tin client (docs/10 § 10.0.B)
    const region = profile.region ?? DEFAULT_REGION;
    const ageBand = this.ageBandOf(profile.birthDate);
    // preference là lựa chọn hợp lệ của client (như matchType); không gửi = any (docs/01 #13)
    const genderPreference = dto.genderPreference ?? GenderPreference.Any;
    const prefixedKey = joinIdempotencyKey(user.userId, idempotencyKey);

    let ticket: MatchTicket;
    try {
      ticket = await this.ticketRepo.save(
        this.ticketRepo.create({
          userId: user.userId,
          matchType: dto.matchType,
          region,
          ageBand,
          genderPreference,
          status: MatchTicketStatus.Queued,
          enqueuedAt: new Date(),
          priorityBoostMs: 0,
          sessionId: null,
          idempotencyKey: prefixedKey,
        }),
      );
    } catch (err) {
      if (!isUniqueViolation(err)) throw err;
      // Replay cùng Idempotency-Key? — check TRƯỚC, vì cả 2 unique constraint có thể cùng dính
      const existing = await this.ticketRepo.findOneBy({
        idempotencyKey: prefixedKey,
      });
      if (existing) {
        if (
          existing.userId !== user.userId ||
          existing.matchType !== dto.matchType ||
          existing.genderPreference !== genderPreference
        ) {
          throw new DomainException(
            MatchingErrors.TICKET_IDEMPOTENCY_CONFLICT,
            'Idempotency-Key đã dùng cho 1 request khác nội dung',
            HttpStatus.CONFLICT,
          );
        }
        // Replay: đảm bảo ticket còn queued vẫn có mặt trong Redis (NX — không đè score đã boost)
        if (existing.status === MatchTicketStatus.Queued)
          await this.ensureEnqueued(existing);
        return existing;
      }
      if (violatedConstraint(err, UQ_ACTIVE_USER)) {
        throw new DomainException(
          MatchingErrors.TICKET_ALREADY_QUEUED,
          'Đã có 1 ticket đang chờ/đang ghép — 1 user chỉ ở trong 1 queue tại 1 thời điểm (docs/06)',
          HttpStatus.CONFLICT,
        );
      }
      throw err;
    }

    // Redis SAU khi DB commit: nếu bước này fail, ticket là "zombie DB" — client retry cùng key
    // sẽ re-enqueue (nhánh replay ở trên), sweeper là chốt chặn cuối (expire quá hạn).
    await this.ensureEnqueued(ticket);
    return ticket;
  }

  async getTicket(
    user: AuthenticatedUser,
    ticketId: string,
  ): Promise<MatchTicket> {
    const ticket = await this.ticketRepo.findOneBy({ id: ticketId });
    if (!ticket) {
      throw new DomainException(
        MatchingErrors.TICKET_NOT_FOUND,
        'Không tìm thấy ticket',
        HttpStatus.NOT_FOUND,
      );
    }
    this.assertOwnership(ticket, user); // IDOR — docs/10 § 10.1.D
    return ticket;
  }

  /** Huỷ ticket của chính mình — chỉ hợp lệ khi đang queued (state machine § 1). */
  async cancelTicket(
    user: AuthenticatedUser,
    ticketId: string,
  ): Promise<MatchTicket> {
    const cancelled = await this.dataSource.transaction(async (manager) => {
      const ticket = await this.lockTicket(manager, ticketId);
      this.assertOwnership(ticket, user);
      this.assertTransition(ticket, MatchTicketStatus.Cancelled);
      ticket.status = MatchTicketStatus.Cancelled;
      return manager.save(ticket);
    });
    // ZREM idempotent — fail thì ticket thành zombie Redis, matcher verify-lại-lúc-ghép sẽ loại (docs/10 § Matching)
    await this.redis.zrem(shardKeyOfTicket(cancelled), cancelled.id);
    return cancelled;
  }

  /**
   * Confirm match. Lock THEO THỨ TỰ session → ticket (2 bên confirm song song đều chờ trên session,
   * không deadlock chéo ticket). Đủ 2 confirm → session + cả 2 ticket sang confirmed, atomic 1 transaction.
   */
  async confirmTicket(
    user: AuthenticatedUser,
    ticketId: string,
  ): Promise<MatchTicket> {
    const pre = await this.getTicket(user, ticketId); // đã check tồn tại + ownership
    if (pre.status === MatchTicketStatus.Confirmed) return pre; // confirm lặp sau khi đã chốt — idempotent
    if (pre.status !== MatchTicketStatus.Matched || !pre.sessionId) {
      throw new DomainException(
        MatchingErrors.TICKET_INVALID_TRANSITION,
        `Ticket đang '${pre.status}', chỉ confirm được khi đang 'matched'`,
        HttpStatus.CONFLICT,
      );
    }
    const sessionId = pre.sessionId;

    return this.dataSource.transaction(async (manager) => {
      const session = await manager.findOne(MatchSession, {
        where: { id: sessionId },
        lock: { mode: 'pessimistic_write' },
      });
      if (!session || session.status !== MatchSessionStatus.PendingConfirm) {
        // sweeper có thể vừa expire session giữa lúc user bấm confirm — xác minh lại tại thời điểm hành động (docs/10 § 10.0.C)
        throw new DomainException(
          MatchingErrors.SESSION_NOT_PENDING,
          'Session không còn chờ confirm',
          HttpStatus.CONFLICT,
        );
      }

      const ticket = await this.lockTicket(manager, ticketId);
      this.assertOwnership(ticket, user);
      if (ticket.status === MatchTicketStatus.Confirmed) return ticket;
      if (ticket.status !== MatchTicketStatus.Matched) {
        throw new DomainException(
          MatchingErrors.TICKET_INVALID_TRANSITION,
          `Ticket đang '${ticket.status}', chỉ confirm được khi đang 'matched'`,
          HttpStatus.CONFLICT,
        );
      }

      const now = new Date();
      if (ticket.id === session.ticketAId)
        session.confirmedAAt = session.confirmedAAt ?? now;
      else if (ticket.id === session.ticketBId)
        session.confirmedBAt = session.confirmedBAt ?? now;
      else
        throw new Error(
          `Ticket ${ticket.id} trỏ session ${session.id} nhưng session không chứa ticket này — dữ liệu hỏng`,
        );

      if (session.confirmedAAt && session.confirmedBAt) {
        const otherId =
          ticket.id === session.ticketAId
            ? session.ticketBId
            : session.ticketAId;
        const other = await this.lockTicket(manager, otherId);
        this.assertTransition(ticket, MatchTicketStatus.Confirmed);
        this.assertTransition(other, MatchTicketStatus.Confirmed);
        ticket.status = MatchTicketStatus.Confirmed;
        other.status = MatchTicketStatus.Confirmed;
        session.status = MatchSessionStatus.Confirmed;
        await manager.save(other);
      }
      await manager.save(session);
      return manager.save(ticket);
    });
  }

  /**
   * Speed-up (spec § 4) — thứ tự BẮT BUỘC: rate-limit Redis → spendDiamond (idempotent) → boost.
   * Boost cộng dồn trong DB rồi set score Redis TUYỆT ĐỐI (ZADD XX): retry/replay cùng key
   * chỉ sửa lại score về đúng tổng đã trả tiền, không double-boost (docs/10 § 10.0.D).
   */
  async speedup(
    user: AuthenticatedUser,
    ticketId: string,
    idempotencyKey: string,
  ): Promise<{
    transactionId: string;
    replayed: boolean;
    ticket: MatchTicket;
  }> {
    const ticket = await this.getTicket(user, ticketId); // tồn tại + ownership
    if (ticket.status !== MatchTicketStatus.Queued) {
      throw new DomainException(
        MatchingErrors.TICKET_INVALID_TRANSITION,
        `Ticket đang '${ticket.status}', chỉ speed-up được khi đang 'queued'`,
        HttpStatus.CONFLICT,
      );
    }

    const maxPerHour = this.config.getOrThrow('MATCHING_SPEEDUP_MAX_PER_HOUR', {
      infer: true,
    });
    const price = this.config.getOrThrow('MATCHING_SPEEDUP_PRICE_DIAMOND', {
      infer: true,
    });
    const boostMs = this.config.getOrThrow('MATCHING_PRIORITY_BOOST_MS', {
      infer: true,
    });
    const countKey = speedupCountKey(user.userId);
    const prefixedKey = speedupIdempotencyKey(user.userId, idempotencyKey);

    // 0) Retry của request ĐÃ trả tiền → phải replay kết quả cũ (docs/05 § 5.10), không phải
    // "lượt mới" — bỏ qua rate-limit, nếu không client retry lúc counter đầy sẽ ăn 409 oan.
    const isRetry = await this.economy.hasTransaction(prefixedKey);

    // 1) Rate-limit TRƯỚC khi trừ tiền — vượt giới hạn thì chưa mất đồng nào (spec § 4)
    if (!isRetry) {
      const granted = Number(
        await this.redis.eval(
          SPEEDUP_RATE_LIMIT_LUA,
          1,
          countKey,
          String(maxPerHour),
          String(SPEEDUP_RATE_WINDOW_SECONDS),
        ),
      );
      if (granted < 0) {
        throw new DomainException(
          MatchingErrors.SPEEDUP_RATE_LIMITED,
          `Vượt giới hạn ${maxPerHour} lần speed-up/giờ`,
          HttpStatus.CONFLICT,
          { maxPerHour },
        );
      }
    }

    // 2) Trừ tiền — ledger tự lo lock ví + idempotency + check số dư tại thời điểm trừ
    let spend: { transactionId: string; replayed: boolean };
    try {
      spend = await this.economy.spendDiamond(
        user.userId,
        TransactionType.MatchingSpeedup,
        price,
        prefixedKey,
        {
          ticketId,
        },
      );
    } catch (err) {
      // trừ tiền fail (vd không đủ diamond) → trả lại slot rate-limit vừa chiếm
      if (!isRetry) await this.redis.decr(countKey).catch(() => undefined);
      throw err;
    }
    if (!spend.replayed) {
      // 3) Cộng dồn boost trong DB — atomic, chỉ khi ticket còn queued (vừa matched thì thôi, tiền
      // vẫn trừ đúng 1 lần theo spec § 4: completion phía Redis/boost retry được, không hoàn tiền)
      await this.ticketRepo.increment(
        { id: ticket.id, status: MatchTicketStatus.Queued },
        'priorityBoostMs',
        boostMs,
      );
    } else if (!isRetry) {
      // 2 request song song CÙNG key: bên thua replay muộn — không phải lượt mới → hoàn slot
      await this.redis.decr(countKey).catch(() => undefined);
    }

    // 4) Set score Redis tuyệt đối từ tổng boost trong DB — XX: member đã rời queue thì bỏ qua
    const fresh = await this.ticketRepo.findOneByOrFail({ id: ticket.id });
    await this.redis.zadd(
      shardKeyOfTicket(fresh),
      'XX',
      String(ticketScore(fresh)),
      fresh.id,
    );

    return {
      transactionId: spend.transactionId,
      replayed: spend.replayed,
      ticket: fresh,
    };
  }

  /** ZADD NX (không đè score đã boost) + SADD shard active — dùng chung cho join/replay. */
  async ensureEnqueued(ticket: MatchTicket): Promise<void> {
    const shard = shardKeyOfTicket(ticket);
    await this.redis.zadd(shard, 'NX', String(ticketScore(ticket)), ticket.id);
    // SADD SAU ZADD: nếu matcher vừa SREM shard rỗng giữa 2 lệnh, SADD này khôi phục lại
    await this.redis.sadd(MATCHING_ACTIVE_SHARDS_KEY, shard);
  }

  // ---------- nội bộ ----------

  private async lockTicket(
    manager: EntityManager,
    ticketId: string,
  ): Promise<MatchTicket> {
    const ticket = await manager.findOne(MatchTicket, {
      where: { id: ticketId },
      lock: { mode: 'pessimistic_write' },
    });
    if (!ticket) {
      throw new DomainException(
        MatchingErrors.TICKET_NOT_FOUND,
        'Không tìm thấy ticket',
        HttpStatus.NOT_FOUND,
      );
    }
    return ticket;
  }

  private assertOwnership(ticket: MatchTicket, user: AuthenticatedUser): void {
    if (ticket.userId !== user.userId) {
      throw new DomainException(
        MatchingErrors.TICKET_FORBIDDEN,
        'Ticket không thuộc về bạn',
        HttpStatus.FORBIDDEN,
      );
    }
  }

  private assertTransition(ticket: MatchTicket, to: MatchTicketStatus): void {
    if (!MATCH_TICKET_TRANSITIONS[ticket.status].includes(to)) {
      throw new DomainException(
        MatchingErrors.TICKET_INVALID_TRANSITION,
        `Không thể chuyển ticket từ '${ticket.status}' sang '${to}'`,
        HttpStatus.CONFLICT,
      );
    }
  }

  private ageBandOf(birthDate: string | null): number {
    if (!birthDate) return UNKNOWN_AGE_BAND;
    const bandSize = this.config.getOrThrow('MATCHING_AGE_BAND_SIZE', {
      infer: true,
    });
    const birth = new Date(birthDate);
    if (Number.isNaN(birth.getTime())) return UNKNOWN_AGE_BAND;
    const now = new Date();
    let age = now.getFullYear() - birth.getFullYear();
    const beforeBirthday =
      now.getMonth() < birth.getMonth() ||
      (now.getMonth() === birth.getMonth() && now.getDate() < birth.getDate());
    if (beforeBirthday) age -= 1;
    if (age < 0) return UNKNOWN_AGE_BAND;
    return Math.floor(age / bandSize);
  }
}
