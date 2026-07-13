import { randomUUID } from 'node:crypto';

import { HttpStatus, Inject, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import { RealtimeEvents } from '@litmatch/common-dtos';
import { DomainException } from '@litmatch/common-exceptions';
import { DataSource, Repository } from 'typeorm';

import { isUniqueViolation } from '../../database/postgres-errors';
import { publishRealtimeEvent } from '../../common/realtime/publish-realtime';
import { CallingErrors } from './calling.errors';
import { CallingMetrics } from './calling.metrics';
import {
  CallEndReason,
  CallSession,
  CallSessionStatus,
  callRoomName,
} from './entities/call-session.entity';
import { LivekitRoomPort } from './ports/livekit-room';
import { CALLING_REDIS } from './redis/calling-redis.provider';
import { MatchSessionStatus, MatchType, MatchingService } from '../matching';

import type {
  CallEndedEventData,
  RealtimeEnvelope,
} from '@litmatch/common-dtos';
import type Redis from 'ioredis';
import type { AuthenticatedUser } from '../../common/decorators/current-user.decorator';
import type { CoreApiEnv } from '../../config/env.validation';
import type { LivekitWebhookEvent } from './ports/livekit-room';

export interface JoinCallResult {
  call: CallSession;
  token: string;
  livekitUrl: string;
}

/** Kết quả end idempotent — `justEnded` chỉ true ở đúng lời gọi thực hiện transition. */
export interface EndCallResult {
  call: CallSession | null;
  justEnded: boolean;
}

/**
 * Nghiệp vụ voice call 2 người trên LiveKit (docs/services/calling-service.md).
 * State machine spec § 1 — `ended` terminal, mọi transition idempotent (webhook retry an toàn).
 * Timer/billing enforce ở CallTickerService; ở đây là lifecycle + token + end idempotent.
 */
@Injectable()
export class CallingService {
  private readonly logger = new Logger(CallingService.name);

  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    @InjectRepository(CallSession)
    private readonly callRepo: Repository<CallSession>,
    private readonly matchingService: MatchingService,
    private readonly livekit: LivekitRoomPort,
    private readonly config: ConfigService<CoreApiEnv, true>,
    @Inject(CALLING_REDIS) private readonly redis: Redis,
    private readonly metrics: CallingMetrics,
  ) {}

  /**
   * Tạo/lấy call của voice session + mint token (spec § 2). Idempotent tự nhiên theo
   * unique match_session_id — re-join sau rớt mạng hợp lệ khi call chưa ended (token mới).
   */
  async joinCall(
    user: AuthenticatedUser,
    matchSessionId: string,
  ): Promise<JoinCallResult> {
    const session = await this.matchingService.findSessionById(matchSessionId);
    if (
      !session ||
      (session.userAId !== user.userId && session.userBId !== user.userId)
    ) {
      throw new DomainException(
        CallingErrors.SESSION_NOT_FOUND,
        'Không tìm thấy session',
        HttpStatus.NOT_FOUND,
      );
    }
    if (
      session.matchType !== MatchType.Voice ||
      session.status !== MatchSessionStatus.Confirmed
    ) {
      throw new DomainException(
        CallingErrors.SESSION_NOT_CALLABLE,
        'Chỉ mở phòng call cho voice session đã đủ 2 bên xác nhận',
        HttpStatus.CONFLICT,
      );
    }

    let call = await this.callRepo.findOneBy({ matchSessionId });
    if (!call) {
      // id sinh trước để đặt roomName từ id — client không bao giờ tự chọn room
      const id = randomUUID();
      try {
        call = await this.callRepo.save(
          this.callRepo.create({
            id,
            matchSessionId,
            roomName: callRoomName(id),
            userAId: session.userAId,
            userBId: session.userBId,
            status: CallSessionStatus.Pending,
          }),
        );
      } catch (err) {
        // 2 bên join gần như đồng thời — bên thua unique lấy call bên kia vừa tạo
        if (!isUniqueViolation(err)) throw err;
        call = await this.callRepo.findOneByOrFail({ matchSessionId });
      }
    }
    if (call.status === CallSessionStatus.Ended) {
      throw new DomainException(
        CallingErrors.CALL_ENDED,
        'Call đã kết thúc',
        HttpStatus.CONFLICT,
        { reason: call.endReason },
      );
    }

    const token = await this.livekit.mintJoinToken(
      call.roomName,
      user.userId,
      this.config.getOrThrow('CALLING_TOKEN_TTL_SECONDS', { infer: true }),
    );
    return {
      call,
      token,
      livekitUrl: this.config.getOrThrow('LIVEKIT_URL', {
        infer: true,
      }),
    };
  }

  /** Poll fallback của realtime `call.ended` — chỉ member (gộp 404, chống oracle). */
  async getCall(user: AuthenticatedUser, callId: string): Promise<CallSession> {
    const call = await this.callRepo.findOneBy({ id: callId });
    if (
      !call ||
      (call.userAId !== user.userId && call.userBId !== user.userId)
    ) {
      throw new DomainException(
        CallingErrors.CALL_NOT_FOUND,
        'Không tìm thấy call',
        HttpStatus.NOT_FOUND,
      );
    }
    return call;
  }

  /** Member chủ động kết thúc — idempotent (đã ended thì trả trạng thái hiện tại). */
  async endCall(user: AuthenticatedUser, callId: string): Promise<CallSession> {
    await this.getCall(user, callId); // tồn tại + membership
    const { call } = await this.endById(callId, CallEndReason.Completed);
    if (!call) {
      throw new DomainException(
        CallingErrors.CALL_NOT_FOUND,
        'Không tìm thấy call',
        HttpStatus.NOT_FOUND,
      );
    }
    return call;
  }

  /**
   * End idempotent — dùng bởi endpoint/webhook/ticker (spec § 1). Lock call FOR UPDATE:
   * đây chính là chốt chặn race end-vs-billing-tick (docs/10 § Calling). Chỉ lời gọi
   * thực hiện transition mới dọn room + publish realtime (không bắn đôi khi retry).
   */
  async endById(callId: string, reason: CallEndReason): Promise<EndCallResult> {
    const result = await this.dataSource.transaction(async (manager) => {
      const call = await manager.findOne(CallSession, {
        where: { id: callId },
        lock: { mode: 'pessimistic_write' },
      });
      if (!call) return { call: null, justEnded: false };
      if (call.status === CallSessionStatus.Ended) {
        return { call, justEnded: false };
      }
      call.status = CallSessionStatus.Ended;
      call.endReason = reason;
      call.endedAt = new Date();
      // durationSeconds theo giờ server core-api — nguồn sự thật thời lượng (spec § 1)
      call.durationSeconds = call.startedAt
        ? Math.max(
            0,
            Math.round(
              (call.endedAt.getTime() - call.startedAt.getTime()) / 1000,
            ),
          )
        : 0;
      return { call: await manager.save(call), justEnded: true };
    });

    if (result.justEnded && result.call) {
      // Call drop rate (docs/07 GĐ6) — đúng 1 lần/call vì chỉ nhánh justEnded mới chạy tới đây
      this.metrics.recordEnded(result.call.endReason ?? reason);
      await this.cleanupEndedCall(result.call);
    }
    return result;
  }

  /**
   * Webhook LiveKit ĐÃ verify chữ ký (spec § 3). Idempotent với retry/out-of-order:
   * joined = set-if-null, end = end-if-not-ended; room không phải `call-*` hoặc identity
   * lạ → bỏ qua.
   */
  async handleWebhookEvent(event: LivekitWebhookEvent): Promise<void> {
    if (!event.roomName?.startsWith('call-')) return;
    const call = await this.callRepo.findOneBy({ roomName: event.roomName });
    if (!call) return;

    switch (event.event) {
      case 'participant_joined':
        if (event.participantIdentity) {
          await this.markJoined(call.id, event.participantIdentity);
        }
        return;
      case 'participant_left':
      case 'room_finished':
        // phòng 2 người: 1 bên rời là call kết thúc (spec § 1)
        await this.endById(call.id, CallEndReason.Completed);
        return;
      default:
        return;
    }
  }

  // ---------- nội bộ ----------

  private async markJoined(callId: string, identity: string): Promise<void> {
    await this.dataSource.transaction(async (manager) => {
      const call = await manager.findOne(CallSession, {
        where: { id: callId },
        lock: { mode: 'pessimistic_write' },
      });
      if (!call || call.status === CallSessionStatus.Ended) return;

      const now = new Date();
      if (identity === call.userAId) call.joinedAAt = call.joinedAAt ?? now;
      else if (identity === call.userBId)
        call.joinedBAt = call.joinedBAt ?? now;
      else return; // identity lạ — token chỉ mint cho member nên đây là event không liên quan

      if (
        call.joinedAAt &&
        call.joinedBAt &&
        call.status === CallSessionStatus.Pending
      ) {
        call.status = CallSessionStatus.Active;
        call.startedAt = call.startedAt ?? now; // mốc free window + billing (spec § 4)
      }
      await manager.save(call);
    });
  }

  /** Sau khi end: dọn room SFU (chống leak) + báo realtime — cả 2 đều best-effort. */
  private async cleanupEndedCall(call: CallSession): Promise<void> {
    await this.livekit.deleteRoom(call.roomName).catch((err) => {
      // room có thể đã tự đóng (room_finished) — không phải lỗi nghiệp vụ
      this.logger.debug(
        `deleteRoom ${call.roomName} bỏ qua: ${err instanceof Error ? err.message : String(err)}`,
      );
    });
    const envelope: RealtimeEnvelope<CallEndedEventData> = {
      event: RealtimeEvents.CallEnded,
      data: {
        callId: call.id,
        matchSessionId: call.matchSessionId,
        reason: call.endReason ?? CallEndReason.Completed,
        durationSeconds: call.durationSeconds ?? 0,
      },
    };
    await Promise.all(
      [call.userAId, call.userBId].map((uid) =>
        publishRealtimeEvent(this.redis, this.logger, uid, envelope),
      ),
    );
  }
}
