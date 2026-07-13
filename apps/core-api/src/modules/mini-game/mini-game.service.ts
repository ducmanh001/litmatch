import { HttpStatus, Inject, Injectable, Logger } from '@nestjs/common';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import { RealtimeEvents } from '@litmatch/common-dtos';
import { DomainException } from '@litmatch/common-exceptions';
import { DataSource, Repository } from 'typeorm';

import { canonicalPair } from '../../common/entities/canonical-pair';
import { publishRealtimeEvent } from '../../common/realtime/publish-realtime';
import { isUniqueViolation } from '../../database/postgres-errors';
import { FriendService } from '../friend';
import { MiniGameActiveParticipant } from './entities/mini-game-active-participant.entity';
import {
  MiniGameSession,
  MiniGameSessionStatus,
} from './entities/mini-game-session.entity';
import { MiniGameErrors } from './mini-game.errors';
import { MiniGameType, resolveWinner } from './mini-game.constants';
import { MINI_GAME_REDIS } from './redis/mini-game-redis.provider';

import type {
  MiniGameSessionResolvedEventData,
  MiniGameSessionStartedEventData,
  RealtimeEnvelope,
} from '@litmatch/common-dtos';
import type Redis from 'ioredis';
import type { RockPaperScissorsMove } from './mini-game.constants';

/** Cột move của 1 user trong session — quyết định bởi caller là `userLowId` hay `userHighId`. */
type MoveColumn = 'lowMove' | 'highMove';

/**
 * Facade của Mini Game module (docs/services/mini-game-service.md): oẳn tù tì 2 người ĐÃ LÀ
 * BẠN, tái dùng đúng khung "cặp canonical + bảng participant phụ trợ" của Movie Match cho bất
 * biến "1 user chỉ có 1 ván `waiting_moves` tại 1 thời điểm". Game duy nhất ở bản này:
 * `rock_paper_scissors` (spec § 0) — logic resolve tách riêng ở `mini-game.constants.ts` để
 * mở rộng game thứ 2 sau này không phải nhét if/else vào service chung (docs/10 § Mini Game).
 */
@Injectable()
export class MiniGameService {
  private readonly logger = new Logger(MiniGameService.name);

  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    @InjectRepository(MiniGameSession)
    private readonly sessionRepo: Repository<MiniGameSession>,
    private readonly friendService: FriendService,
    @Inject(MINI_GAME_REDIS) private readonly redis: Redis,
  ) {}

  /**
   * Tạo ván mới — chỉ giữa 2 người đã là bạn (spec § 1). Idempotent theo cặp: đã có ván
   * `waiting_moves` đúng cặp này → trả lại ván hiện có (không tạo ván song song); user đang
   * chờ move ở CẶP KHÁC → 409 `MINI_GAME_ALREADY_WAITING` (không tự ý huỷ ván cũ thay user).
   * Race an toàn nhờ PK `userId` của `MiniGameActiveParticipant` (migration 1753400000000,
   * COPY kỹ thuật `MovieSessionActiveParticipant`): cố INSERT cả `MiniGameSession` + 2 dòng
   * participant TRONG 1 TRANSACTION → bắt unique violation → đọc lại để phân biệt "cặp trùng,
   * replay" với "user đã chờ move ở cặp khác" (docs/05 § 5.10).
   */
  async createSession(
    userId: string,
    friendUserId: string,
    gameType: MiniGameType,
  ): Promise<MiniGameSession> {
    if (userId === friendUserId) {
      throw new DomainException(
        MiniGameErrors.NOT_FRIEND,
        'Không thể chơi cùng chính mình',
        HttpStatus.NOT_FOUND,
      );
    }
    if (!(await this.friendService.areFriends(userId, friendUserId))) {
      throw new DomainException(
        MiniGameErrors.NOT_FRIEND,
        'Không phải bạn của bạn',
        HttpStatus.NOT_FOUND,
      );
    }

    const [userLowId, userHighId] = canonicalPair(userId, friendUserId);

    const existing = await this.findWaitingByPair(userLowId, userHighId);
    if (existing) return existing;

    let created: MiniGameSession;
    try {
      created = await this.dataSource.transaction(async (manager) => {
        const session = await manager.save(
          manager.create(MiniGameSession, {
            userLowId,
            userHighId,
            gameType,
            lowMove: null,
            highMove: null,
            status: MiniGameSessionStatus.WaitingMoves,
            winnerUserId: null,
            resolvedAt: null,
          }),
        );
        // PK userId chặn: bất kỳ user nào trong cặp đã chờ move ở session KHÁC (dù ở vai trò
        // low hay high) → unique violation → rollback CẢ transaction (không mồ côi row).
        await manager.insert(MiniGameActiveParticipant, [
          { userId: userLowId, sessionId: session.id },
          { userId: userHighId, sessionId: session.id },
        ]);
        return session;
      });
    } catch (err) {
      if (!isUniqueViolation(err)) throw err;
      // Race: request khác vừa ghi trước — đọc lại để phân biệt "đúng cặp" (idempotent replay)
      // với "user đã chờ move ở cặp khác" (409, không đoán ý user).
      const raced = await this.findWaitingByPair(userLowId, userHighId);
      if (raced) return raced;
      throw new DomainException(
        MiniGameErrors.ALREADY_WAITING,
        'Đang có ván khác chờ move',
        HttpStatus.CONFLICT,
      );
    }

    const envelope: RealtimeEnvelope<MiniGameSessionStartedEventData> = {
      event: RealtimeEvents.MiniGameSessionStarted,
      data: {
        sessionId: created.id,
        gameType: created.gameType,
        initiatorUserId: userId,
      },
    };
    await Promise.all(
      [userLowId, userHighId].map((uid) =>
        publishRealtimeEvent(this.redis, this.logger, uid, envelope),
      ),
    );
    return created;
  }

  /**
   * Nộp move — chốt chặn DUY NHẤT là UPDATE có điều kiện (docs/10 § Mini Game): request thứ 2
   * của CÙNG user (double-submit/race) hoặc session không còn `waiting_moves` (đã
   * resolved/cancelled) → 0 row ảnh hưởng → 409 `MINI_GAME_MOVE_ALREADY_SUBMITTED`, KHÔNG đổi
   * được move đã nộp. Đọc lại session TRONG CÙNG TRANSACTION: đủ cả 2 move → resolve (tính
   * thắng/thua, xoá participant, publish CẢ 2 move); chỉ 1 move → KHÔNG resolve, KHÔNG publish
   * gì (tránh lộ trạng thái đối phương cho ai, kể cả người vừa nộp).
   */
  async submitMove(
    userId: string,
    sessionId: string,
    move: RockPaperScissorsMove,
  ): Promise<MiniGameSession> {
    const session = await this.getSessionForParticipant(userId, sessionId);
    const moveColumn: MoveColumn =
      session.userLowId === userId ? 'lowMove' : 'highMove';
    const moveColumnSql = moveColumn === 'lowMove' ? 'low_move' : 'high_move';

    const { session: updatedSession, resolved } =
      await this.dataSource.transaction(async (manager) => {
        const updateResult = await manager
          .createQueryBuilder()
          .update(MiniGameSession)
          .set({ [moveColumn]: move } as Partial<MiniGameSession>)
          .where(`id = :id AND ${moveColumnSql} IS NULL AND status = :status`, {
            id: sessionId,
            status: MiniGameSessionStatus.WaitingMoves,
          })
          .execute();

        if (!updateResult.affected) {
          throw new DomainException(
            MiniGameErrors.MOVE_ALREADY_SUBMITTED,
            'Move đã được nộp hoặc ván không còn chờ move',
            HttpStatus.CONFLICT,
          );
        }

        const reloaded = await manager
          .getRepository(MiniGameSession)
          .findOneByOrFail({ id: sessionId });

        if (!reloaded.lowMove || !reloaded.highMove) {
          // Chỉ 1 bên đã nộp — không resolve, không lộ gì thêm.
          return { session: reloaded, resolved: null };
        }

        const outcome = resolveWinner(reloaded.lowMove, reloaded.highMove);
        const winnerUserId =
          outcome === 'draw'
            ? null
            : outcome === 'low'
              ? reloaded.userLowId
              : reloaded.userHighId;
        const resolvedAt = new Date();

        await manager.update(
          MiniGameSession,
          { id: sessionId },
          {
            status: MiniGameSessionStatus.Resolved,
            winnerUserId,
            resolvedAt,
          },
        );
        await manager.delete(MiniGameActiveParticipant, { sessionId });

        const resolvedSession: MiniGameSession = {
          ...reloaded,
          status: MiniGameSessionStatus.Resolved,
          winnerUserId,
          resolvedAt,
        };
        return {
          session: resolvedSession,
          resolved: {
            lowMove: reloaded.lowMove,
            highMove: reloaded.highMove,
            winnerUserId,
          },
        };
      });

    if (resolved) {
      const publishData: MiniGameSessionResolvedEventData = {
        sessionId,
        lowMove: resolved.lowMove,
        highMove: resolved.highMove,
        winnerUserId: resolved.winnerUserId,
      };
      const envelope: RealtimeEnvelope<MiniGameSessionResolvedEventData> = {
        event: RealtimeEvents.MiniGameSessionResolved,
        data: publishData,
      };
      await Promise.all(
        [session.userLowId, session.userHighId].map((uid) =>
          publishRealtimeEvent(this.redis, this.logger, uid, envelope),
        ),
      );
    }

    return updatedSession;
  }

  /**
   * 1 trong 2 bên huỷ ván đang chờ move. Ván đã `resolved` → 409 `MINI_GAME_NOT_CANCELLABLE`
   * (không huỷ ngược 1 ván đã có kết quả). Đã `cancelled` từ trước → no-op idempotent (trả
   * nguyên trạng, không throw — hành động không có side-effect tiền nên lặp lại vô hại, cùng
   * pattern `MovieMatchService.endSession`).
   */
  async cancelSession(
    userId: string,
    sessionId: string,
  ): Promise<MiniGameSession> {
    const session = await this.getSessionForParticipant(userId, sessionId);
    if (session.status === MiniGameSessionStatus.Cancelled) return session;
    if (session.status === MiniGameSessionStatus.Resolved) {
      throw new DomainException(
        MiniGameErrors.NOT_CANCELLABLE,
        'Ván đã có kết quả, không thể huỷ',
        HttpStatus.CONFLICT,
      );
    }

    await this.dataSource.transaction(async (manager) => {
      await manager.update(
        MiniGameSession,
        { id: sessionId },
        { status: MiniGameSessionStatus.Cancelled },
      );
      await manager.delete(MiniGameActiveParticipant, { sessionId });
    });

    return { ...session, status: MiniGameSessionStatus.Cancelled };
  }

  /** Poll fallback — cùng payload dùng cho realtime (spec § 5). */
  async getSession(
    userId: string,
    sessionId: string,
  ): Promise<MiniGameSession> {
    return this.getSessionForParticipant(userId, sessionId);
  }

  // ---------- nội bộ ----------

  private async findWaitingByPair(
    userLowId: string,
    userHighId: string,
  ): Promise<MiniGameSession | null> {
    return this.sessionRepo.findOneBy({
      userLowId,
      userHighId,
      status: MiniGameSessionStatus.WaitingMoves,
    });
  }

  /** Tồn tại + caller là participant — gộp 404 (docs/10 § 10.1.D, cùng pattern Movie Match). */
  private async getSessionForParticipant(
    userId: string,
    sessionId: string,
  ): Promise<MiniGameSession> {
    const session = await this.sessionRepo.findOneBy({ id: sessionId });
    if (
      !session ||
      (session.userLowId !== userId && session.userHighId !== userId)
    ) {
      throw new DomainException(
        MiniGameErrors.NOT_FOUND,
        'Không tìm thấy ván chơi',
        HttpStatus.NOT_FOUND,
      );
    }
    return session;
  }
}
