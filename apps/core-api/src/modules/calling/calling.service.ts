import { randomUUID } from 'node:crypto';

import { HttpStatus, Inject, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import { RealtimeEvents } from '@litmatch/common-dtos';
import { DomainException } from '@litmatch/common-exceptions';
import { DataSource, Repository } from 'typeorm';

import { isUniqueViolation } from '../../database/postgres-errors';
import {
  hasLivekitRegionUrls,
  resolveLivekitUrl,
} from '../../common/livekit/livekit-url';
import { publishRealtimeEvent } from '../../common/realtime/publish-realtime';
import { CallingErrors } from './calling.errors';
import { CallingMetrics } from './calling.metrics';
import {
  CallEndReason,
  CallKind,
  CallSession,
  CallSessionStatus,
  callRoomName,
} from './entities/call-session.entity';
import { VoiceMatchReaction } from './entities/voice-match-reaction.entity';
import { LivekitRoomPort } from './ports/livekit-room';
import { CALLING_REDIS } from './redis/calling-redis.provider';
import { MatchSessionStatus, MatchType, MatchingService } from '../matching';
import { FriendService, FriendshipSource } from '../friend';
import { UserService } from '../user';

import type {
  CallEndedEventData,
  RealtimeEnvelope,
} from '@litmatch/common-dtos';
import type Redis from 'ioredis';
import type { AuthenticatedUser } from '../../common/decorators/current-user.decorator';
import type { CoreApiEnv } from '../../config/env.validation';
import type { LivekitWebhookEvent } from './ports/livekit-room';
import { canonicalPair } from '../../common/entities/canonical-pair';

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

export interface VoiceMatchLikeResult {
  liked: boolean;
  matched: boolean;
  /** Chỉ reveal sau mutual like; client dùng để mở conversation bạn bè bền vững. */
  friendUserId: string | null;
}

export type VoiceMatchLikeState = VoiceMatchLikeResult;

/**
 * Nghiệp vụ voice call 2 người trên LiveKit (docs/services/calling-service.md).
 * State machine spec § 1 — `ended` terminal, mọi transition idempotent (webhook retry an toàn).
 * Voice Match timer enforce ở CallTickerService; ở đây là lifecycle + token + end idempotent.
 */
@Injectable()
export class CallingService {
  private readonly logger = new Logger(CallingService.name);

  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    @InjectRepository(CallSession)
    private readonly callRepo: Repository<CallSession>,
    @InjectRepository(VoiceMatchReaction)
    private readonly reactionRepo: Repository<VoiceMatchReaction>,
    private readonly matchingService: MatchingService,
    private readonly friendService: FriendService,
    private readonly livekit: LivekitRoomPort,
    private readonly config: ConfigService<CoreApiEnv, true>,
    private readonly userService: UserService,
    @Inject(CALLING_REDIS) private readonly redis: Redis,
    private readonly metrics: CallingMetrics,
  ) {}

  /** Giá thời lượng do server cấu hình; DTO chỉ phát mốc kết thúc để client render countdown. */
  getFreeCallSeconds(): number {
    return this.config.getOrThrow('CALLING_FREE_CALL_SECONDS', { infer: true });
  }

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
    let call = await this.callRepo.findOneBy({ matchSessionId });
    if (
      session.matchType !== MatchType.Voice ||
      session.status !== MatchSessionStatus.Confirmed
    ) {
      // Sau timeout/webhook, MatchSession đã terminal cùng CallSession. Giữ lỗi CALL_ENDED cho
      // re-join của call cũ để client có một nhánh xử lý dứt khoát; nếu có row pending orphan
      // từ race đời trước thì dọn luôn thay vì để ticker phải chờ.
      if (call?.status === CallSessionStatus.Ended) {
        throw new DomainException(
          CallingErrors.CALL_ENDED,
          'Call đã kết thúc',
          HttpStatus.CONFLICT,
          { reason: call.endReason },
        );
      }
      if (call && session.matchType === MatchType.Voice) {
        await this.endById(call.id, CallEndReason.Completed);
      }
      throw new DomainException(
        CallingErrors.SESSION_NOT_CALLABLE,
        'Chỉ mở phòng call cho voice session đã đủ 2 bên xác nhận',
        HttpStatus.CONFLICT,
      );
    }

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
            callKind: CallKind.VoiceMatch,
          }),
        );
      } catch (err) {
        // 2 bên join gần như đồng thời — bên thua unique lấy call bên kia vừa tạo
        if (!isUniqueViolation(err)) throw err;
        call = await this.callRepo.findOneByOrFail({ matchSessionId });
      }
    }
    // `endMatchSession` có thể chạy ngay giữa lúc request join đang tạo CallSession (user
    // bấm back/đóng tab ở thiết bị còn lại). Re-check sau upsert biến race đó thành một call
    // terminal thay vì để pending orphan tới ticker timeout. Matching vẫn là owner của state.
    const currentSession =
      await this.matchingService.findSessionById(matchSessionId);
    if (
      !currentSession ||
      currentSession.matchType !== MatchType.Voice ||
      currentSession.status !== MatchSessionStatus.Confirmed ||
      (currentSession.userAId !== user.userId &&
        currentSession.userBId !== user.userId)
    ) {
      await this.endById(call.id, CallEndReason.Completed);
      throw new DomainException(
        CallingErrors.CALL_ENDED,
        'Phiên Voice Match đã kết thúc',
        HttpStatus.CONFLICT,
      );
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
      livekitUrl: await this.resolveCallLivekitUrl(call),
    };
  }

  /** Tạo/lấy một friend call; không có free timer và không liên quan MatchSession. */
  async joinFriendCall(
    user: AuthenticatedUser,
    friendUserId: string,
  ): Promise<JoinCallResult> {
    if (
      user.userId === friendUserId ||
      !(await this.friendService.areFriends(user.userId, friendUserId))
    ) {
      throw new DomainException(
        CallingErrors.SESSION_NOT_FOUND,
        'Chỉ bạn bè sau mutual like mới được gọi voice lâu dài',
        HttpStatus.NOT_FOUND,
      );
    }
    const [userAId, userBId] = canonicalPair(user.userId, friendUserId);
    let call = await this.callRepo
      .createQueryBuilder('call')
      .where('call.call_kind = :kind', { kind: CallKind.Friend })
      .andWhere('call.user_a_id = :userAId', { userAId })
      .andWhere('call.user_b_id = :userBId', { userBId })
      .andWhere('call.status IN (:...statuses)', {
        statuses: [CallSessionStatus.Pending, CallSessionStatus.Active],
      })
      .getOne();
    if (!call) {
      try {
        const id = randomUUID();
        call = await this.callRepo.save(
          this.callRepo.create({
            id,
            matchSessionId: null,
            roomName: callRoomName(id),
            userAId,
            userBId,
            callKind: CallKind.Friend,
            status: CallSessionStatus.Pending,
          }),
        );
      } catch (err) {
        if (!isUniqueViolation(err)) throw err;
        call = await this.callRepo
          .createQueryBuilder('call')
          .where('call.call_kind = :kind', { kind: CallKind.Friend })
          .andWhere('call.user_a_id = :userAId', { userAId })
          .andWhere('call.user_b_id = :userBId', { userBId })
          .andWhere('call.status IN (:...statuses)', {
            statuses: [CallSessionStatus.Pending, CallSessionStatus.Active],
          })
          .getOneOrFail();
      }
    }
    const token = await this.livekit.mintJoinToken(
      call.roomName,
      user.userId,
      this.config.getOrThrow('CALLING_TOKEN_TTL_SECONDS', { infer: true }),
    );
    return {
      call,
      token,
      livekitUrl: await this.resolveCallLivekitUrl(call),
    };
  }

  /** Poll fallback của realtime `call.ended` — chỉ member (gộp 404, chống oracle). */
  async getCall(user: AuthenticatedUser, callId: string): Promise<CallSession> {
    let call = await this.callRepo.findOneBy({ id: callId });
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
    call = await this.reconcileCallWithLivekit(call, user.userId);
    return call;
  }

  /**
   * Trạng thái reaction đọc từ DB để nút tim không bị reset sau reload/refetch. `matched` chỉ
   * trả friendUserId sau khi mutual like đã tạo Friendship (hoặc cặp vốn đã là bạn).
   */
  async getLikeState(
    user: AuthenticatedUser,
    call: CallSession,
  ): Promise<VoiceMatchLikeState> {
    const partnerId =
      call.userAId === user.userId ? call.userBId : call.userAId;
    if (call.callKind === CallKind.Friend)
      return { liked: false, matched: true, friendUserId: partnerId };
    const liked = await this.reactionRepo.existsBy({
      callId: call.id,
      raterUserId: user.userId,
    });
    const matched = await this.friendService.areFriends(user.userId, partnerId);
    return {
      liked,
      matched,
      friendUserId: matched ? partnerId : null,
    };
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
    if (call.callKind !== CallKind.Friend && call.matchSessionId)
      await this.matchingService.endVoiceSession(user, call.matchSessionId);
    return call;
  }

  /**
   * Rời màn Voice Match trước khi LiveKit tạo call cũng phải đóng durable session. Nếu call đã
   * tồn tại thì đóng nó trước (idempotent), sau đó Matching chốt session terminal cho cả cặp.
   */
  async endMatchSession(
    user: AuthenticatedUser,
    matchSessionId: string,
  ): Promise<void> {
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
    const call = await this.callRepo.findOneBy({ matchSessionId });
    if (call) await this.endById(call.id, CallEndReason.Completed);
    await this.matchingService.endVoiceSession(user, matchSessionId);
  }

  /**
   * Like trong hoặc sau khi cuộc gọi đã kết thúc. Hai lượt like được serialize bằng lock CallSession;
   * reaction unique ở DB và Friendship/Conversation cùng transaction nên retry/double tap không
   * tạo đôi hoặc tạo Friendship thiếu Conversation.
   */
  async likeCall(
    user: AuthenticatedUser,
    callId: string,
  ): Promise<VoiceMatchLikeResult> {
    await this.getCall(user, callId);
    try {
      return await this.dataSource.transaction(async (manager) => {
        const call = await manager.findOne(CallSession, {
          where: { id: callId },
          lock: { mode: 'pessimistic_write' },
        });
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
        // Consent phải được ghi ngay trong lúc đang nói để UX không bắt user phải end chỉ để
        // bấm like. `pending` chưa có cuộc nói chuyện thực nên vẫn bị chặn; `active` và `ended`
        // đều hợp lệ, reaction unique bảo đảm retry/double tap vô hại.
        if (
          call.callKind === CallKind.Friend ||
          (call.status !== CallSessionStatus.Active &&
            call.status !== CallSessionStatus.Ended)
        ) {
          throw new DomainException(
            CallingErrors.CALL_NOT_ENDED,
            'Chỉ có thể yêu thích khi cuộc gọi đã kết nối hoặc đã kết thúc',
            HttpStatus.CONFLICT,
          );
        }
        const partnerId =
          call.userAId === user.userId ? call.userBId : call.userAId;
        const existing = await manager.findOneBy(VoiceMatchReaction, {
          callId,
          raterUserId: user.userId,
        });
        if (!existing) {
          await manager.save(
            manager.create(VoiceMatchReaction, {
              callId,
              raterUserId: user.userId,
            }),
          );
        }
        const partnerLiked = await manager.existsBy(VoiceMatchReaction, {
          callId,
          raterUserId: partnerId,
        });
        if (partnerLiked) {
          await this.friendService.ensureFriendship(
            manager,
            user.userId,
            partnerId,
            FriendshipSource.VoiceMatch,
          );
        }
        const matched =
          partnerLiked ||
          (await this.friendService.areFriends(user.userId, partnerId));
        return {
          liked: true,
          matched,
          friendUserId: matched ? partnerId : null,
        };
      });
    } catch (err) {
      if (!isUniqueViolation(err)) throw err;
      const call = await this.getCall(user, callId);
      const partnerId =
        call.userAId === user.userId ? call.userBId : call.userAId;
      const matched = await this.friendService.areFriends(
        user.userId,
        partnerId,
      );
      return {
        liked: true,
        matched,
        friendUserId: matched ? partnerId : null,
      };
    }
  }

  /**
   * End idempotent — dùng bởi endpoint/webhook/ticker (spec § 1). Lock call FOR UPDATE:
   * đây chính là chốt chặn race end-vs-tick (docs/10 § Calling). Chỉ lời gọi
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
      // Không tính thời gian nằm trong cửa sổ reconnect vào thời lượng đã dùng.
      // Nếu cửa sổ hết hạn thì mốc startedAt được dời qua đoạn gián đoạn trước khi
      // duration được chốt.
      if (call.startedAt && call.reconnectStartedAt) {
        const pausedMs = Math.max(
          0,
          call.endedAt.getTime() - call.reconnectStartedAt.getTime(),
        );
        call.startedAt = new Date(call.startedAt.getTime() + pausedMs);
      }
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
      case 'participant_connection_aborted':
        if (event.participantIdentity) {
          await this.markDisconnected(call.id, event.participantIdentity);
        }
        return;
      case 'room_finished':
        // LiveKit có thể phát participant_left/room_finished do mất mạng hoặc
        // connection bị abort. Chờ reconnect ngắn trước khi terminal hóa call.
        await this.markRoomDisconnected(call.id);
        return;
      default:
        return;
    }
  }

  // ---------- nội bộ ----------

  /**
   * Webhook là kênh chính; đối soát RoomService là backstop cho cấu hình webhook lỗi/mất mạng.
   * Pending chỉ được chuyển khi LiveKit xác nhận member thật sự có mặt. Active mà đối phương
   * không còn trong room thì chốt ended để client không treo màn hình vô hạn.
   */
  private async reconcileCallWithLivekit(
    call: CallSession,
    userId: string,
  ): Promise<CallSession> {
    let identities: string[];
    try {
      identities = await this.livekit.listParticipantIdentities(call.roomName);
    } catch (err) {
      // Webhook/ticker vẫn là nguồn fallback khi RoomService tạm unavailable; GET không được
      // biến lỗi hạ tầng SFU thành lỗi 500 làm mất màn hình cuộc gọi.
      this.logger.debug(
        `Không đối soát được participant của ${call.roomName}: ${err instanceof Error ? err.message : String(err)}`,
      );
      return call;
    }

    if (call.status === CallSessionStatus.Pending) {
      // RoomService đã là nguồn sự thật cho cả room: ghi nhận mọi identity hợp lệ mà
      // LiveKit trả về, không phụ thuộc việc browser của phía còn lại có đang poll hay không.
      const memberIds = identities.filter(
        (identity) => identity === call.userAId || identity === call.userBId,
      );
      if (memberIds.length === 0) return call;
      for (const identity of memberIds) {
        await this.markJoined(call.id, identity);
      }
      return (await this.callRepo.findOneBy({ id: call.id })) ?? call;
    }

    if (call.status === CallSessionStatus.Active) {
      const partnerId = call.userAId === userId ? call.userBId : call.userAId;
      if (!identities.includes(partnerId)) {
        const ended = await this.endById(call.id, CallEndReason.Completed);
        return ended.call ?? call;
      }
    }
    return call;
  }

  /**
   * Chọn LiveKit URL theo region (GĐ7 — ADR 0005). QUY TẮC: dùng region của `call.userAId` —
   * mốc TẤT ĐỊNH theo call row (không phụ thuộc ai gọi joinCall trước/sau), nên cả 2 bên và
   * mọi lần re-join đều nhận cùng URL. Chọn userA thay vì "region người gọi" vì 2 client của
   * cùng 1 call phải về cùng endpoint. Matching đã shard queue theo (matchType, region, ageBand)
   * — docs/03 § 3.8.B — nên 2 bên cùng region theo cấu tạo; nếu lệch (dữ liệu cũ/user đổi region
   * sau khi match) chỉ WARN và vẫn dùng region userA: mọi URL trong map cùng MỘT cụm LiveKit
   * (bất biến ADR 0005) nên call không vỡ, tệ nhất là kém tối ưu latency cho 1 bên.
   * Mọi lỗi lookup region đều fallback LIVEKIT_URL — chọn URL không bao giờ chặn join call.
   */
  private async resolveCallLivekitUrl(call: CallSession): Promise<string> {
    const defaultUrl = this.config.getOrThrow('LIVEKIT_URL', { infer: true });
    const regionUrls = this.config.getOrThrow('LIVEKIT_REGION_URLS', {
      infer: true,
    });
    // Chưa bật multi-region (mặc định hôm nay) → không tốn query, hành vi y hệt trước GĐ7
    if (!hasLivekitRegionUrls(regionUrls)) return defaultUrl;

    try {
      const [userA, userB] = await Promise.all([
        this.userService.getByIdOrThrow(call.userAId),
        this.userService.getByIdOrThrow(call.userBId),
      ]);
      if ((userA.region ?? null) !== (userB.region ?? null)) {
        this.logger.warn(
          `Region lệch giữa 2 bên call ${call.id} (userA=${userA.region ?? 'null'}, userB=${userB.region ?? 'null'}) — dùng region userA theo quy tắc tất định`,
        );
      }
      return resolveLivekitUrl(regionUrls, defaultUrl, userA.region);
    } catch (err) {
      this.logger.warn(
        `Không resolve được region cho call ${call.id} — fallback LIVEKIT_URL: ${err instanceof Error ? err.message : String(err)}`,
      );
      return defaultUrl;
    }
  }

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
        call.startedAt = call.startedAt ?? now; // mốc giới hạn Voice Match (spec § 4)
      }

      if (call.status === CallSessionStatus.Active) {
        if (identity === call.userAId) call.disconnectedAAt = null;
        if (identity === call.userBId) call.disconnectedBAt = null;

        // Chỉ resume khi cả 2 đã quay lại. Mốc này cũng giúp reconnect sau
        // room_finished không làm mất phần thời gian đã dùng trước đó.
        if (
          call.reconnectStartedAt &&
          call.disconnectedAAt === null &&
          call.disconnectedBAt === null &&
          call.startedAt
        ) {
          const pausedMs = Math.max(
            0,
            now.getTime() - call.reconnectStartedAt.getTime(),
          );
          call.startedAt = new Date(call.startedAt.getTime() + pausedMs);
          call.reconnectStartedAt = null;
        }
      }
      await manager.save(call);
    });
  }

  private async markDisconnected(
    callId: string,
    identity: string,
  ): Promise<void> {
    await this.dataSource.transaction(async (manager) => {
      const call = await manager.findOne(CallSession, {
        where: { id: callId },
        lock: { mode: 'pessimistic_write' },
      });
      if (!call || call.status !== CallSessionStatus.Active) return;

      const now = new Date();
      if (identity === call.userAId) call.disconnectedAAt ??= now;
      else if (identity === call.userBId) call.disconnectedBAt ??= now;
      else return;
      call.reconnectStartedAt ??= now;
      await manager.save(call);
    });
  }

  private async markRoomDisconnected(callId: string): Promise<void> {
    await this.dataSource.transaction(async (manager) => {
      const call = await manager.findOne(CallSession, {
        where: { id: callId },
        lock: { mode: 'pessimistic_write' },
      });
      if (!call || call.status !== CallSessionStatus.Active) return;

      const now = new Date();
      call.reconnectStartedAt ??= now;
      call.disconnectedAAt ??= now;
      call.disconnectedBAt ??= now;
      await manager.save(call);
    });
  }

  /** Sau khi end: dọn room SFU (chống leak) + báo realtime — cả 2 đều best-effort. */
  private async cleanupEndedCall(call: CallSession): Promise<void> {
    // Chốt Matching trước khi phát event: user nhận `call.ended` rồi quay lại tìm match sẽ không
    // bao giờ bị session confirmed cũ giữ lại. Đây cũng cover webhook/ticker, không chỉ nút UI.
    if (call.callKind !== CallKind.Friend && call.matchSessionId)
      await this.matchingService.endVoiceSessionForCall(
        call.matchSessionId,
        call.userAId,
        call.userBId,
      );
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
