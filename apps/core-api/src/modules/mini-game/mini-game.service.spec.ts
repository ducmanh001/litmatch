import { DomainException } from '@litmatch/common-exceptions';

import { MiniGameActiveParticipant } from './entities/mini-game-active-participant.entity';
import {
  MiniGameSession,
  MiniGameSessionStatus,
} from './entities/mini-game-session.entity';
import { MiniGameErrors } from './mini-game.errors';
import { MiniGameService } from './mini-game.service';
import { MiniGameType, RockPaperScissorsMove } from './mini-game.constants';

import type { Repository } from 'typeorm';
import type { FriendService } from '../friend';

const USER_A = 'user-a';
const USER_B = 'user-b';

function makeSession(
  overrides: Partial<MiniGameSession> = {},
): MiniGameSession {
  return Object.assign(new MiniGameSession(), {
    id: 'sess-1',
    userLowId: USER_A,
    userHighId: USER_B,
    gameType: MiniGameType.RockPaperScissors,
    lowMove: null,
    highMove: null,
    status: MiniGameSessionStatus.WaitingMoves,
    winnerUserId: null,
    resolvedAt: null,
    ...overrides,
  });
}

class UniqueViolationError extends Error {
  code = '23505';
}

describe('MiniGameService (unit — mock repo/dataSource/friendService/redis)', () => {
  let sessionRepo: {
    findOneBy: jest.Mock;
    create: jest.Mock;
    save: jest.Mock;
  };
  let manager: {
    create: jest.Mock;
    save: jest.Mock;
    insert: jest.Mock;
    update: jest.Mock;
    delete: jest.Mock;
    createQueryBuilder: jest.Mock;
    getRepository: jest.Mock;
  };
  let updateQueryBuilder: {
    update: jest.Mock;
    set: jest.Mock;
    where: jest.Mock;
    execute: jest.Mock;
  };
  let reloadedRepo: { findOneByOrFail: jest.Mock };
  let dataSource: { transaction: jest.Mock };
  let friendService: { areFriends: jest.Mock };
  let redis: { publish: jest.Mock };
  let service: MiniGameService;

  beforeEach(() => {
    sessionRepo = {
      findOneBy: jest.fn(async () => null),
      create: jest.fn((input) => input),
      save: jest.fn(async (input) => ({ id: 'sess-1', ...input })),
    };

    updateQueryBuilder = {
      update: jest.fn(function (this: unknown) {
        return updateQueryBuilder;
      }),
      set: jest.fn(function (this: unknown) {
        return updateQueryBuilder;
      }),
      where: jest.fn(function (this: unknown) {
        return updateQueryBuilder;
      }),
      execute: jest.fn(async () => ({ affected: 1 })),
    };

    reloadedRepo = {
      findOneByOrFail: jest.fn(async () => makeSession()),
    };

    manager = {
      create: jest.fn((_entity: unknown, input: unknown) => input),
      save: jest.fn(async (input) => ({ id: 'sess-1', ...(input as object) })),
      insert: jest.fn(async () => undefined),
      update: jest.fn(async () => undefined),
      delete: jest.fn(async () => undefined),
      createQueryBuilder: jest.fn(() => updateQueryBuilder),
      getRepository: jest.fn(() => reloadedRepo),
    };
    dataSource = {
      transaction: jest.fn(async (cb: (m: typeof manager) => unknown) =>
        cb(manager),
      ),
    };
    friendService = { areFriends: jest.fn(async () => true) };
    redis = { publish: jest.fn(async () => 1) };
    service = new MiniGameService(
      dataSource as never,
      sessionRepo as unknown as Repository<MiniGameSession>,
      friendService as unknown as FriendService,
      redis as never,
    );
  });

  function expectDomainError(err: unknown, code: string): void {
    expect(err).toBeInstanceOf(DomainException);
    expect((err as DomainException).code).toBe(code);
  }

  describe('createSession — quan hệ bạn bè', () => {
    it('tự nhắm chính mình → 404 NOT_FRIEND, không query friendService', async () => {
      const err = await service
        .createSession(USER_A, USER_A, MiniGameType.RockPaperScissors)
        .catch((e) => e);
      expectDomainError(err, MiniGameErrors.NOT_FRIEND);
      expect(friendService.areFriends).not.toHaveBeenCalled();
    });

    it('không phải bạn → 404 NOT_FRIEND (cùng mã cho not-found/not-friend)', async () => {
      friendService.areFriends.mockResolvedValue(false);
      const err = await service
        .createSession(USER_A, USER_B, MiniGameType.RockPaperScissors)
        .catch((e) => e);
      expectDomainError(err, MiniGameErrors.NOT_FRIEND);
      expect(dataSource.transaction).not.toHaveBeenCalled();
    });
  });

  describe('createSession — tạo mới / idempotent / conflict', () => {
    it('chưa có ván waiting_moves → tạo mới (session + 2 dòng participant CÙNG transaction), publish minigame.session.started cho CẢ 2', async () => {
      const created = await service.createSession(
        USER_A,
        USER_B,
        MiniGameType.RockPaperScissors,
      );
      expect(created.id).toBe('sess-1');
      expect(dataSource.transaction).toHaveBeenCalledTimes(1);
      expect(manager.save).toHaveBeenCalledTimes(1);
      expect(manager.insert.mock.calls[0][1]).toEqual([
        { userId: USER_A, sessionId: 'sess-1' },
        { userId: USER_B, sessionId: 'sess-1' },
      ]);
      expect(redis.publish).toHaveBeenCalledTimes(2);
      const envelope = JSON.parse(redis.publish.mock.calls[0][1] as string) as {
        event: string;
        data: { sessionId: string; initiatorUserId: string };
      };
      expect(envelope.event).toBe('minigame.session.started');
      expect(envelope.data.initiatorUserId).toBe(USER_A);
    });

    it('đã có ván waiting_moves ĐÚNG cặp này → trả lại ván cũ, KHÔNG mở transaction mới (idempotent)', async () => {
      const existing = makeSession();
      sessionRepo.findOneBy.mockResolvedValueOnce(existing);
      const result = await service.createSession(
        USER_A,
        USER_B,
        MiniGameType.RockPaperScissors,
      );
      expect(result).toBe(existing);
      expect(dataSource.transaction).not.toHaveBeenCalled();
      expect(redis.publish).not.toHaveBeenCalled();
    });

    it('race: insert bị unique violation nhưng đọc lại thấy ĐÚNG cặp → trả lại (không 500)', async () => {
      sessionRepo.findOneBy
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce(makeSession());
      dataSource.transaction.mockRejectedValueOnce(new UniqueViolationError());

      const result = await service.createSession(
        USER_A,
        USER_B,
        MiniGameType.RockPaperScissors,
      );
      expect(result.id).toBe('sess-1');
    });

    it('đang chờ move với CẶP KHÁC → 409 MINI_GAME_ALREADY_WAITING (không tự huỷ ván cũ thay user)', async () => {
      sessionRepo.findOneBy.mockResolvedValue(null);
      dataSource.transaction.mockRejectedValueOnce(new UniqueViolationError());

      const err = await service
        .createSession(USER_A, USER_B, MiniGameType.RockPaperScissors)
        .catch((e) => e);
      expectDomainError(err, MiniGameErrors.ALREADY_WAITING);
    });

    it('lỗi DB khác unique violation → ném nguyên văn (không nuốt lỗi hệ thống)', async () => {
      const dbError = new Error('connection reset');
      dataSource.transaction.mockRejectedValueOnce(dbError);
      await expect(
        service.createSession(USER_A, USER_B, MiniGameType.RockPaperScissors),
      ).rejects.toBe(dbError);
    });
  });

  describe('submitMove — IDOR + không lộ + chống double-submit', () => {
    it('không phải participant → 404 NOT_FOUND (IDOR)', async () => {
      sessionRepo.findOneBy.mockResolvedValue(
        makeSession({ userLowId: 'x', userHighId: 'y' }),
      );
      const err = await service
        .submitMove(USER_A, 'sess-1', RockPaperScissorsMove.Rock)
        .catch((e) => e);
      expectDomainError(err, MiniGameErrors.NOT_FOUND);
      expect(dataSource.transaction).not.toHaveBeenCalled();
    });

    it('session không tồn tại → CÙNG 404 NOT_FOUND', async () => {
      sessionRepo.findOneBy.mockResolvedValue(null);
      const err = await service
        .submitMove(USER_A, 'sess-1', RockPaperScissorsMove.Rock)
        .catch((e) => e);
      expectDomainError(err, MiniGameErrors.NOT_FOUND);
    });

    it('nộp lần đầu, đối phương chưa nộp → update cột lowMove, KHÔNG resolve, KHÔNG publish', async () => {
      sessionRepo.findOneBy.mockResolvedValue(makeSession());
      reloadedRepo.findOneByOrFail.mockResolvedValue(
        makeSession({ lowMove: RockPaperScissorsMove.Rock, highMove: null }),
      );

      const result = await service.submitMove(
        USER_A,
        'sess-1',
        RockPaperScissorsMove.Rock,
      );
      expect(result.status).toBe(MiniGameSessionStatus.WaitingMoves);
      expect(updateQueryBuilder.set).toHaveBeenCalledWith({
        lowMove: RockPaperScissorsMove.Rock,
      });
      expect(manager.update).not.toHaveBeenCalled(); // không set status=resolved
      expect(redis.publish).not.toHaveBeenCalled();
    });

    it('nộp move cột high khi caller là userHighId', async () => {
      sessionRepo.findOneBy.mockResolvedValue(makeSession());
      reloadedRepo.findOneByOrFail.mockResolvedValue(
        makeSession({ lowMove: null, highMove: RockPaperScissorsMove.Paper }),
      );

      await service.submitMove(USER_B, 'sess-1', RockPaperScissorsMove.Paper);
      expect(updateQueryBuilder.set).toHaveBeenCalledWith({
        highMove: RockPaperScissorsMove.Paper,
      });
    });

    it('update có điều kiện thấy 0 row (đã nộp trước đó / session không còn waiting_moves) → 409 MOVE_ALREADY_SUBMITTED, KHÔNG đổi move', async () => {
      sessionRepo.findOneBy.mockResolvedValue(makeSession());
      updateQueryBuilder.execute.mockResolvedValue({ affected: 0 });

      const err = await service
        .submitMove(USER_A, 'sess-1', RockPaperScissorsMove.Rock)
        .catch((e) => e);
      expectDomainError(err, MiniGameErrors.MOVE_ALREADY_SUBMITTED);
      expect(reloadedRepo.findOneByOrFail).not.toHaveBeenCalled();
    });

    it('cả 2 đã nộp → resolve, xoá participant, publish minigame.session.resolved kèm CẢ 2 move cho cả 2 bên', async () => {
      sessionRepo.findOneBy.mockResolvedValue(makeSession());
      reloadedRepo.findOneByOrFail.mockResolvedValue(
        makeSession({
          lowMove: RockPaperScissorsMove.Rock,
          highMove: RockPaperScissorsMove.Scissors,
        }),
      );

      const result = await service.submitMove(
        USER_A,
        'sess-1',
        RockPaperScissorsMove.Rock,
      );
      expect(result.status).toBe(MiniGameSessionStatus.Resolved);
      expect(result.winnerUserId).toBe(USER_A); // rock thắng scissors
      expect(manager.update).toHaveBeenCalledWith(
        MiniGameSession,
        { id: 'sess-1' },
        expect.objectContaining({
          status: MiniGameSessionStatus.Resolved,
          winnerUserId: USER_A,
        }),
      );
      expect(manager.delete).toHaveBeenCalledWith(MiniGameActiveParticipant, {
        sessionId: 'sess-1',
      });

      expect(redis.publish).toHaveBeenCalledTimes(2);
      const channels = redis.publish.mock.calls.map(([c]) => c as string);
      expect(channels.sort()).toEqual(
        [`realtime:user:${USER_A}`, `realtime:user:${USER_B}`].sort(),
      );
      const envelope = JSON.parse(redis.publish.mock.calls[0][1] as string) as {
        event: string;
        data: {
          lowMove: string;
          highMove: string;
          winnerUserId: string | null;
        };
      };
      expect(envelope.event).toBe('minigame.session.resolved');
      expect(envelope.data.lowMove).toBe(RockPaperScissorsMove.Rock);
      expect(envelope.data.highMove).toBe(RockPaperScissorsMove.Scissors);
      expect(envelope.data.winnerUserId).toBe(USER_A);
    });

    describe('luật thắng thua rock/paper/scissors — đủ 9 tổ hợp', () => {
      const R = RockPaperScissorsMove.Rock;
      const P = RockPaperScissorsMove.Paper;
      const S = RockPaperScissorsMove.Scissors;
      const cases: Array<[string, string, string | null]> = [
        [R, R, null],
        [R, P, 'high'],
        [R, S, 'low'],
        [P, R, 'low'],
        [P, P, null],
        [P, S, 'high'],
        [S, R, 'high'],
        [S, P, 'low'],
        [S, S, null],
      ];

      it.each(cases)(
        'low=%s high=%s → winner side %s',
        async (lowMove, highMove, winnerSide) => {
          sessionRepo.findOneBy.mockResolvedValue(makeSession());
          reloadedRepo.findOneByOrFail.mockResolvedValue(
            makeSession({
              lowMove: lowMove as RockPaperScissorsMove,
              highMove: highMove as RockPaperScissorsMove,
            }),
          );
          const result = await service.submitMove(
            USER_A,
            'sess-1',
            lowMove as RockPaperScissorsMove,
          );
          const expectedWinner =
            winnerSide === 'low'
              ? USER_A
              : winnerSide === 'high'
                ? USER_B
                : null;
          expect(result.winnerUserId).toBe(expectedWinner);
        },
      );
    });
  });

  describe('cancelSession', () => {
    it('không phải participant → 404 NOT_FOUND', async () => {
      sessionRepo.findOneBy.mockResolvedValue(
        makeSession({ userLowId: 'x', userHighId: 'y' }),
      );
      const err = await service.cancelSession(USER_A, 'sess-1').catch((e) => e);
      expectDomainError(err, MiniGameErrors.NOT_FOUND);
    });

    it('đã cancelled từ trước → no-op idempotent, không mở transaction', async () => {
      sessionRepo.findOneBy.mockResolvedValue(
        makeSession({ status: MiniGameSessionStatus.Cancelled }),
      );
      const result = await service.cancelSession(USER_A, 'sess-1');
      expect(result.status).toBe(MiniGameSessionStatus.Cancelled);
      expect(dataSource.transaction).not.toHaveBeenCalled();
    });

    it('đã resolved → 409 NOT_CANCELLABLE (không huỷ ngược ván đã có kết quả)', async () => {
      sessionRepo.findOneBy.mockResolvedValue(
        makeSession({ status: MiniGameSessionStatus.Resolved }),
      );
      const err = await service.cancelSession(USER_A, 'sess-1').catch((e) => e);
      expectDomainError(err, MiniGameErrors.NOT_CANCELLABLE);
      expect(dataSource.transaction).not.toHaveBeenCalled();
    });

    it('đang waiting_moves → status=cancelled, xoá participant', async () => {
      sessionRepo.findOneBy.mockResolvedValue(makeSession());
      const result = await service.cancelSession(USER_A, 'sess-1');
      expect(result.status).toBe(MiniGameSessionStatus.Cancelled);
      expect(manager.update).toHaveBeenCalledWith(
        MiniGameSession,
        { id: 'sess-1' },
        { status: MiniGameSessionStatus.Cancelled },
      );
      expect(manager.delete).toHaveBeenCalledWith(MiniGameActiveParticipant, {
        sessionId: 'sess-1',
      });
    });
  });

  describe('getSession', () => {
    it('không tồn tại → 404 NOT_FOUND', async () => {
      sessionRepo.findOneBy.mockResolvedValue(null);
      const err = await service.getSession(USER_A, 'sess-1').catch((e) => e);
      expectDomainError(err, MiniGameErrors.NOT_FOUND);
    });

    it('là participant → trả session hiện tại', async () => {
      sessionRepo.findOneBy.mockResolvedValue(makeSession());
      const result = await service.getSession(USER_A, 'sess-1');
      expect(result.id).toBe('sess-1');
    });
  });
});
