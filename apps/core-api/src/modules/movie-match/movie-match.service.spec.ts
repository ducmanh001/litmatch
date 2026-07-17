import { DomainException } from '@litmatch/common-exceptions';

import { MovieSessionActiveParticipant } from './entities/movie-session-active-participant.entity';
import {
  MovieSession,
  MovieSessionStatus,
} from './entities/movie-session.entity';
import { MovieMatchErrors } from './movie-match.errors';
import { MovieMatchService } from './movie-match.service';

import type { ConfigService } from '@nestjs/config';
import type { Repository } from 'typeorm';

import type { CoreApiEnv } from '../../config/env.validation';
import type { FriendService } from '../friend';

const USER_A = 'user-a';
const USER_B = 'user-b';
const VALID_URL = 'https://www.youtube.com/watch?v=abc123';

const CONFIG: Record<string, unknown> = {
  MOVIE_MATCH_URL_MAX_LENGTH: 2048,
  MOVIE_MATCH_ALLOWED_VIDEO_HOSTS: 'youtube.com,youtu.be',
};
const configStub = {
  getOrThrow: (key: string) => {
    if (!(key in CONFIG)) throw new Error(`missing config ${key}`);
    return CONFIG[key];
  },
} as unknown as ConfigService<CoreApiEnv, true>;

function makeSession(overrides: Partial<MovieSession> = {}): MovieSession {
  return Object.assign(new MovieSession(), {
    id: 'sess-1',
    userLowId: USER_A,
    userHighId: USER_B,
    videoUrl: VALID_URL,
    positionSeconds: 0,
    isPlaying: false,
    positionUpdatedAt: new Date('2026-01-01T00:00:00Z'),
    status: MovieSessionStatus.Active,
    endedAt: null,
    endReason: null,
    ...overrides,
  });
}

class UniqueViolationError extends Error {
  code = '23505';
}

describe('MovieMatchService (unit — mock repo/dataSource/friendService/redis)', () => {
  let sessionRepo: {
    findOneBy: jest.Mock;
    create: jest.Mock;
    save: jest.Mock;
    update: jest.Mock;
  };
  let manager: {
    create: jest.Mock;
    save: jest.Mock;
    insert: jest.Mock;
    update: jest.Mock;
    delete: jest.Mock;
  };
  let dataSource: { transaction: jest.Mock };
  let friendService: { areFriends: jest.Mock };
  let redis: { publish: jest.Mock };
  let service: MovieMatchService;

  beforeEach(() => {
    sessionRepo = {
      findOneBy: jest.fn(async () => null),
      create: jest.fn((input) => input),
      save: jest.fn(async (input) => ({ id: 'sess-1', ...input })),
      update: jest.fn(async () => undefined),
    };
    manager = {
      create: jest.fn((_entity: unknown, input: unknown) => input),
      save: jest.fn(async (input) => ({ id: 'sess-1', ...(input as object) })),
      insert: jest.fn(async () => undefined),
      update: jest.fn(async () => undefined),
      delete: jest.fn(async () => undefined),
    };
    dataSource = {
      transaction: jest.fn(async (cb: (m: typeof manager) => unknown) =>
        cb(manager),
      ),
    };
    friendService = { areFriends: jest.fn(async () => true) };
    redis = { publish: jest.fn(async () => 1) };
    service = new MovieMatchService(
      dataSource as never,
      sessionRepo as unknown as Repository<MovieSession>,
      // messageRepo/safetyService chỉ dùng ở flow ẩn danh — suite này test flow bạn bè
      { save: jest.fn(), create: jest.fn(), findOneBy: jest.fn() } as never,
      friendService as unknown as FriendService,
      { canPair: jest.fn(async () => true) } as never,
      configStub,
      redis as never,
    );
  });

  function expectDomainError(err: unknown, code: string): void {
    expect(err).toBeInstanceOf(DomainException);
    expect((err as DomainException).code).toBe(code);
  }

  describe('createSession — validate videoUrl', () => {
    it('URL sai format → 422 INVALID_VIDEO_URL, không gọi friendService', async () => {
      const err = await service
        .createSession(USER_A, USER_B, 'khong-phai-url')
        .catch((e) => e);
      expectDomainError(err, MovieMatchErrors.INVALID_VIDEO_URL);
      expect(friendService.areFriends).not.toHaveBeenCalled();
    });

    it('domain giả mạo dạng subdomain (youtube.com.evil.com) → 422, KHÔNG bypass', async () => {
      const err = await service
        .createSession(USER_A, USER_B, 'https://youtube.com.evil.com/watch')
        .catch((e) => e);
      expectDomainError(err, MovieMatchErrors.INVALID_VIDEO_URL);
    });

    it('domain không nằm whitelist → 422', async () => {
      const err = await service
        .createSession(USER_A, USER_B, 'https://vimeo.com/12345')
        .catch((e) => e);
      expectDomainError(err, MovieMatchErrors.INVALID_VIDEO_URL);
    });

    it('subdomain THẬT của host whitelist (m.youtube.com) → hợp lệ', async () => {
      await expect(
        service.createSession(
          USER_A,
          USER_B,
          'https://m.youtube.com/watch?v=1',
        ),
      ).resolves.toBeDefined();
    });

    it('quá MOVIE_MATCH_URL_MAX_LENGTH → 422', async () => {
      const longUrl = `https://youtube.com/watch?v=${'a'.repeat(2048)}`;
      const err = await service
        .createSession(USER_A, USER_B, longUrl)
        .catch((e) => e);
      expectDomainError(err, MovieMatchErrors.INVALID_VIDEO_URL);
    });

    it('protocol khác http/https (javascript:) → 422', async () => {
      const err = await service
        .createSession(USER_A, USER_B, 'javascript:alert(1)')
        .catch((e) => e);
      expectDomainError(err, MovieMatchErrors.INVALID_VIDEO_URL);
    });
  });

  describe('createSession — quan hệ bạn bè', () => {
    it('tự nhắm chính mình → 404 NOT_FRIEND, không query friendService', async () => {
      const err = await service
        .createSession(USER_A, USER_A, VALID_URL)
        .catch((e) => e);
      expectDomainError(err, MovieMatchErrors.NOT_FRIEND);
      expect(friendService.areFriends).not.toHaveBeenCalled();
    });

    it('không phải bạn → 404 NOT_FRIEND (cùng mã cho not-found/not-friend)', async () => {
      friendService.areFriends.mockResolvedValue(false);
      const err = await service
        .createSession(USER_A, USER_B, VALID_URL)
        .catch((e) => e);
      expectDomainError(err, MovieMatchErrors.NOT_FRIEND);
      expect(dataSource.transaction).not.toHaveBeenCalled();
    });
  });

  describe('createSession — tạo mới / idempotent / conflict', () => {
    it('chưa có session active → tạo mới (session + 2 dòng participant CÙNG transaction), publish movie.session.started cho CẢ 2', async () => {
      const created = await service.createSession(USER_A, USER_B, VALID_URL);
      expect(created.id).toBe('sess-1');
      expect(dataSource.transaction).toHaveBeenCalledTimes(1);
      expect(manager.save).toHaveBeenCalledTimes(1);
      expect(manager.insert).toHaveBeenCalledTimes(1);
      // PK userId chặn xung đột CHÉO cột — insert cả 2 dòng (low, high) cùng lúc
      expect(manager.insert.mock.calls[0][1]).toEqual([
        { userId: USER_A, sessionId: 'sess-1' },
        { userId: USER_B, sessionId: 'sess-1' },
      ]);
      expect(redis.publish).toHaveBeenCalledTimes(2);
      const channels = redis.publish.mock.calls.map(([c]) => c as string);
      expect(channels.sort()).toEqual(
        [`realtime:user:${USER_A}`, `realtime:user:${USER_B}`].sort(),
      );
      const envelope = JSON.parse(redis.publish.mock.calls[0][1] as string) as {
        event: string;
        data: { sessionId: string; initiatorUserId: string };
      };
      expect(envelope.event).toBe('movie.session.started');
      expect(envelope.data.initiatorUserId).toBe(USER_A);
    });

    it('đã active ĐÚNG cặp này → trả lại session cũ, KHÔNG mở transaction mới (idempotent)', async () => {
      const existing = makeSession();
      sessionRepo.findOneBy.mockResolvedValueOnce(existing);
      const result = await service.createSession(USER_A, USER_B, VALID_URL);
      expect(result).toBe(existing);
      expect(dataSource.transaction).not.toHaveBeenCalled();
      expect(redis.publish).not.toHaveBeenCalled();
    });

    it('race: insert bị unique violation nhưng đọc lại thấy ĐÚNG cặp → trả lại (không 500)', async () => {
      sessionRepo.findOneBy
        .mockResolvedValueOnce(null) // check trước insert
        .mockResolvedValueOnce(makeSession()); // đọc lại sau unique violation
      dataSource.transaction.mockRejectedValueOnce(new UniqueViolationError());

      const result = await service.createSession(USER_A, USER_B, VALID_URL);
      expect(result.id).toBe('sess-1');
    });

    it('đang active với CẶP KHÁC → 409 MOVIE_SESSION_ALREADY_ACTIVE (không tự kết thúc thay user)', async () => {
      sessionRepo.findOneBy.mockResolvedValue(null); // không có session active cho CẶP NÀY
      dataSource.transaction.mockRejectedValueOnce(new UniqueViolationError());

      const err = await service
        .createSession(USER_A, USER_B, VALID_URL)
        .catch((e) => e);
      expectDomainError(err, MovieMatchErrors.ALREADY_ACTIVE);
    });

    it('lỗi DB khác unique violation → ném nguyên văn (không nuốt lỗi hệ thống)', async () => {
      const dbError = new Error('connection reset');
      dataSource.transaction.mockRejectedValueOnce(dbError);
      await expect(
        service.createSession(USER_A, USER_B, VALID_URL),
      ).rejects.toBe(dbError);
    });
  });

  describe('updateState — không lock, last-write-wins', () => {
    it('không phải participant → 404 NOT_FOUND (IDOR)', async () => {
      sessionRepo.findOneBy.mockResolvedValue(
        makeSession({ userLowId: 'x', userHighId: 'y' }),
      );
      const err = await service
        .updateState(USER_A, 'sess-1', 10, true)
        .catch((e) => e);
      expectDomainError(err, MovieMatchErrors.NOT_FOUND);
    });

    it('session không tồn tại → CÙNG 404 NOT_FOUND', async () => {
      sessionRepo.findOneBy.mockResolvedValue(null);
      const err = await service
        .updateState(USER_A, 'sess-1', 10, true)
        .catch((e) => e);
      expectDomainError(err, MovieMatchErrors.NOT_FOUND);
    });

    it('session đã ended → 409 MOVIE_SESSION_ENDED', async () => {
      sessionRepo.findOneBy.mockResolvedValue(
        makeSession({ status: MovieSessionStatus.Ended }),
      );
      const err = await service
        .updateState(USER_A, 'sess-1', 10, true)
        .catch((e) => e);
      expectDomainError(err, MovieMatchErrors.ENDED);
      expect(sessionRepo.update).not.toHaveBeenCalled();
    });

    it('thành công → UPDATE đơn giản + publish movie.state.changed cho cả 2', async () => {
      sessionRepo.findOneBy.mockResolvedValue(makeSession());
      const updated = await service.updateState(USER_A, 'sess-1', 42.5, true);
      expect(updated.positionSeconds).toBe(42.5);
      expect(updated.isPlaying).toBe(true);
      expect(sessionRepo.update).toHaveBeenCalledWith(
        { id: 'sess-1' },
        expect.objectContaining({ positionSeconds: 42.5, isPlaying: true }),
      );
      expect(redis.publish).toHaveBeenCalledTimes(2);
      const envelope = JSON.parse(redis.publish.mock.calls[0][1] as string) as {
        event: string;
        data: { positionSeconds: number; isPlaying: boolean };
      };
      expect(envelope.event).toBe('movie.state.changed');
      expect(envelope.data.positionSeconds).toBe(42.5);
    });
  });

  describe('endSession', () => {
    it('không phải participant → 404 NOT_FOUND', async () => {
      sessionRepo.findOneBy.mockResolvedValue(
        makeSession({ userLowId: 'x', userHighId: 'y' }),
      );
      const err = await service.endSession(USER_A, 'sess-1').catch((e) => e);
      expectDomainError(err, MovieMatchErrors.NOT_FOUND);
    });

    it('đã ended từ trước → no-op idempotent, không mở transaction/publish lại', async () => {
      sessionRepo.findOneBy.mockResolvedValue(
        makeSession({ status: MovieSessionStatus.Ended }),
      );
      const result = await service.endSession(USER_A, 'sess-1');
      expect(result.status).toBe(MovieSessionStatus.Ended);
      expect(dataSource.transaction).not.toHaveBeenCalled();
      expect(redis.publish).not.toHaveBeenCalled();
    });

    it('thành công → status=ended, endReason=left, xoá participant, publish movie.session.ended cho cả 2', async () => {
      sessionRepo.findOneBy.mockResolvedValue(makeSession());
      const result = await service.endSession(USER_A, 'sess-1');
      expect(result.status).toBe(MovieSessionStatus.Ended);
      expect(result.endReason).toBe('left');
      expect(manager.update).toHaveBeenCalledWith(
        MovieSession,
        { id: 'sess-1' },
        expect.objectContaining({ status: MovieSessionStatus.Ended }),
      );
      expect(manager.delete).toHaveBeenCalledWith(
        MovieSessionActiveParticipant,
        { sessionId: 'sess-1' },
      );
      expect(redis.publish).toHaveBeenCalledTimes(2);
      const envelope = JSON.parse(redis.publish.mock.calls[0][1] as string) as {
        event: string;
        data: { reason: string };
      };
      expect(envelope.event).toBe('movie.session.ended');
      expect(envelope.data.reason).toBe('left');
    });
  });

  describe('getSession', () => {
    it('không tồn tại → 404 NOT_FOUND', async () => {
      sessionRepo.findOneBy.mockResolvedValue(null);
      const err = await service.getSession(USER_A, 'sess-1').catch((e) => e);
      expectDomainError(err, MovieMatchErrors.NOT_FOUND);
    });

    it('là participant → trả session hiện tại', async () => {
      sessionRepo.findOneBy.mockResolvedValue(makeSession());
      const result = await service.getSession(USER_A, 'sess-1');
      expect(result.id).toBe('sess-1');
    });
  });
});
