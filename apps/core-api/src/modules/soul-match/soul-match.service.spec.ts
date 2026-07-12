import { DomainException } from '@litmatch/common-exceptions';
import { encodeCursor } from '@litmatch/common-dtos';

import { SoulMatchService, SoulRoomPhase } from './soul-match.service';
import { SoulMatchErrors } from './soul-match.errors';
import { SoulChatMessage } from './entities/soul-chat-message.entity';
import {
  SoulMatchRating,
  SoulMatchVerdict,
} from './entities/soul-match-rating.entity';
import { SoulMessageDto, SoulSenderRole } from './dto/soul-match.dtos';
import { MatchSession, MatchSessionStatus, MatchType } from '../matching';
import { UserStatus } from '../user';

import type { ConfigService } from '@nestjs/config';
import type { EntityManager, Repository } from 'typeorm';

import type { CoreApiEnv } from '../../config/env.validation';
import type { AuthenticatedUser } from '../../common/decorators/current-user.decorator';
import type { User } from '../user';

const CONFIG: Record<string, unknown> = {
  SOUL_CHAT_DURATION_SECONDS: 150,
  SOUL_RATING_WINDOW_SECONDS: 120,
  SOUL_CHAT_MESSAGE_MAX_LENGTH: 20,
};
const configStub = {
  getOrThrow: (key: string) => {
    if (!(key in CONFIG)) throw new Error(`missing config ${key}`);
    return CONFIG[key];
  },
} as unknown as ConfigService<CoreApiEnv, true>;

const me: AuthenticatedUser = { userId: 'user-me', isGuest: false };
const PARTNER_ID = 'user-partner';

/** Session soul đã confirmed cách đây `secondsAgo` giây (phase derive theo Date.now thật). */
function makeSession(
  secondsAgo: number,
  overrides: Partial<MatchSession> = {},
): MatchSession {
  const confirmedAt = new Date(Date.now() - secondsAgo * 1000);
  return Object.assign(new MatchSession(), {
    id: 'session-1',
    matchType: MatchType.Soul,
    userAId: me.userId,
    userBId: PARTNER_ID,
    ticketAId: 'ticket-a',
    ticketBId: 'ticket-b',
    status: MatchSessionStatus.Confirmed,
    confirmedAAt: new Date(confirmedAt.getTime() - 1000),
    confirmedBAt: confirmedAt, // max(A,B) là mốc mở phòng
    endedAt: null,
    ...overrides,
  });
}

function uniqueViolation(): Error {
  return Object.assign(new Error('duplicate key'), { code: '23505' });
}

describe('SoulMatchService (unit — mock repo/matching/friend)', () => {
  let messageRepo: {
    save: jest.Mock;
    create: jest.Mock;
    findOneBy: jest.Mock;
    createQueryBuilder: jest.Mock;
  };
  let ratingRepo: { findOneBy: jest.Mock };
  let matchingService: { findSessionById: jest.Mock };
  let friendService: { areFriends: jest.Mock; ensureFriendship: jest.Mock };
  let userService: { getByIdOrThrow: jest.Mock };
  let manager: {
    findOne: jest.Mock;
    findOneBy: jest.Mock;
    save: jest.Mock;
    create: jest.Mock;
  };
  let dataSource: { transaction: jest.Mock };
  let redis: { publish: jest.Mock };
  let service: SoulMatchService;

  beforeEach(() => {
    messageRepo = {
      // như DB thật: cấp id + createdAt lúc insert (publish realtime dùng createdAt)
      save: jest.fn(async (m) =>
        Object.assign(m, {
          id: (m as { id?: string }).id ?? 'msg-new',
          createdAt: (m as { createdAt?: Date }).createdAt ?? new Date(),
        }),
      ),
      create: jest.fn((input) => Object.assign(new SoulChatMessage(), input)),
      findOneBy: jest.fn(),
      createQueryBuilder: jest.fn(),
    };
    ratingRepo = { findOneBy: jest.fn(async () => null) };
    matchingService = {
      findSessionById: jest.fn(async () => makeSession(0)),
    };
    friendService = {
      areFriends: jest.fn(async () => false),
      ensureFriendship: jest.fn(async () => ({ created: true })),
    };
    userService = {
      getByIdOrThrow: jest.fn(
        async (id: string) =>
          ({
            id,
            nickname: 'nick',
            status: UserStatus.Active,
            gender: 'unknown',
            avatarId: 'default-01',
          }) as unknown as User,
      ),
    };
    manager = {
      findOne: jest.fn(async () => makeSession(0)), // lock session row
      findOneBy: jest.fn(async () => null),
      save: jest.fn(async (r) => r),
      create: jest.fn((_e, input) =>
        Object.assign(new SoulMatchRating(), input),
      ),
    };
    dataSource = {
      transaction: jest.fn(async (cb: (m: EntityManager) => Promise<unknown>) =>
        cb(manager as unknown as EntityManager),
      ),
    };
    redis = { publish: jest.fn(async () => 1) };
    service = new SoulMatchService(
      dataSource as never,
      messageRepo as unknown as Repository<SoulChatMessage>,
      ratingRepo as unknown as Repository<SoulMatchRating>,
      matchingService as never,
      friendService as never,
      userService as never,
      configStub,
      redis as never,
    );
  });

  function expectDomainError(err: unknown, code: string): void {
    expect(err).toBeInstanceOf(DomainException);
    expect((err as DomainException).code).toBe(code);
  }

  describe('getRoomForMember (qua getSessionView)', () => {
    it('session không tồn tại → 404 SESSION_NOT_FOUND', async () => {
      matchingService.findSessionById.mockResolvedValue(null);
      const err = await service.getSessionView(me, 'session-1').catch((e) => e);
      expectDomainError(err, SoulMatchErrors.SESSION_NOT_FOUND);
    });

    it('không phải thành viên → CÙNG 404 (không làm oracle dò sessionId — IDOR docs/10 § 10.1.D)', async () => {
      matchingService.findSessionById.mockResolvedValue(
        makeSession(0, { userAId: 'user-x', userBId: 'user-y' }),
      );
      const err = await service.getSessionView(me, 'session-1').catch((e) => e);
      expectDomainError(err, SoulMatchErrors.SESSION_NOT_FOUND);
    });

    it('session chưa đủ 2 confirm → 409 CHAT_NOT_OPEN', async () => {
      matchingService.findSessionById.mockResolvedValue(
        makeSession(0, { status: MatchSessionStatus.PendingConfirm }),
      );
      const err = await service.getSessionView(me, 'session-1').catch((e) => e);
      expectDomainError(err, SoulMatchErrors.CHAT_NOT_OPEN);
    });

    it('session voice không có phòng chat ẩn danh → 409 CHAT_NOT_OPEN', async () => {
      matchingService.findSessionById.mockResolvedValue(
        makeSession(0, { matchType: MatchType.Voice }),
      );
      const err = await service.getSessionView(me, 'session-1').catch((e) => e);
      expectDomainError(err, SoulMatchErrors.CHAT_NOT_OPEN);
    });

    it.each([
      [0, SoulRoomPhase.Chatting],
      [200, SoulRoomPhase.Rating], // 150 < 200 < 270
      [300, SoulRoomPhase.Closed], // > 270
    ])(
      'phase derive từ giờ server: confirm cách đây %ss → %s',
      async (secondsAgo, phase) => {
        matchingService.findSessionById.mockResolvedValue(
          makeSession(secondsAgo as number),
        );
        const view = await service.getSessionView(me, 'session-1');
        expect(view.room.phase).toBe(phase);
      },
    );
  });

  describe('sendMessage', () => {
    const dto = { content: 'hello' };

    it('phase chatting → lưu message với idempotency key prefix theo user', async () => {
      const saved = await service.sendMessage(me, 'session-1', dto, 'k1');
      expect(saved.idempotencyKey).toBe('soul:msg:user-me:k1');
      expect(saved.senderUserId).toBe(me.userId);
    });

    it('hết giờ chat (phase rating) → 409 CHAT_NOT_OPEN, không tin timer client', async () => {
      matchingService.findSessionById.mockResolvedValue(makeSession(200));
      const err = await service
        .sendMessage(me, 'session-1', dto, 'k1')
        .catch((e) => e);
      expectDomainError(err, SoulMatchErrors.CHAT_NOT_OPEN);
      expect(messageRepo.save).not.toHaveBeenCalled();
    });

    it('bị ban giữa chừng → 403 USER_BANNED (re-check tại thời điểm gửi — § 10.0.C)', async () => {
      userService.getByIdOrThrow.mockResolvedValue({
        id: me.userId,
        status: UserStatus.Banned,
      } as unknown as User);
      const err = await service
        .sendMessage(me, 'session-1', dto, 'k1')
        .catch((e) => e);
      expectDomainError(err, SoulMatchErrors.USER_BANNED);
    });

    it('vượt SOUL_CHAT_MESSAGE_MAX_LENGTH (config) → 422 MESSAGE_TOO_LONG', async () => {
      const err = await service
        .sendMessage(me, 'session-1', { content: 'x'.repeat(21) }, 'k1')
        .catch((e) => e);
      expectDomainError(err, SoulMatchErrors.MESSAGE_TOO_LONG);
    });

    it('message MỚI → publish realtime cho cả 2 với senderRole per-recipient; replay KHÔNG bắn lại', async () => {
      await service.sendMessage(me, 'session-1', dto, 'k1');
      expect(redis.publish).toHaveBeenCalledTimes(2);
      const calls = redis.publish.mock.calls.map(
        ([channel, raw]: [string, string]) => ({
          channel,
          envelope: JSON.parse(raw) as {
            event: string;
            data: { senderRole: string };
          },
        }),
      );
      const toMe = calls.find((c) => c.channel === 'realtime:user:user-me');
      const toPartner = calls.find(
        (c) => c.channel === `realtime:user:${PARTNER_ID}`,
      );
      expect(toMe?.envelope.event).toBe('soul.message');
      expect(toMe?.envelope.data.senderRole).toBe('me');
      expect(toPartner?.envelope.data.senderRole).toBe('partner');

      redis.publish.mockClear();
      messageRepo.save.mockRejectedValue(uniqueViolation());
      messageRepo.findOneBy.mockResolvedValue(
        Object.assign(new SoulChatMessage(), {
          id: 'msg-1',
          sessionId: 'session-1',
          senderUserId: me.userId,
          content: 'hello',
          createdAt: new Date(),
        }),
      );
      await service.sendMessage(me, 'session-1', dto, 'k1');
      expect(redis.publish).not.toHaveBeenCalled();
    });

    it('retry cùng key cùng nội dung → replay message cũ, không nhân đôi', async () => {
      const existing = Object.assign(new SoulChatMessage(), {
        id: 'msg-1',
        sessionId: 'session-1',
        senderUserId: me.userId,
        content: 'hello',
        idempotencyKey: 'soul:msg:user-me:k1',
      });
      messageRepo.save.mockRejectedValue(uniqueViolation());
      messageRepo.findOneBy.mockResolvedValue(existing);
      const result = await service.sendMessage(me, 'session-1', dto, 'k1');
      expect(result).toBe(existing);
    });

    it('cùng key nhưng nội dung khác → 409 MESSAGE_IDEMPOTENCY_CONFLICT', async () => {
      messageRepo.save.mockRejectedValue(uniqueViolation());
      messageRepo.findOneBy.mockResolvedValue(
        Object.assign(new SoulChatMessage(), {
          sessionId: 'session-1',
          content: 'khac',
          idempotencyKey: 'soul:msg:user-me:k1',
        }),
      );
      const err = await service
        .sendMessage(me, 'session-1', dto, 'k1')
        .catch((e) => e);
      expectDomainError(err, SoulMatchErrors.MESSAGE_IDEMPOTENCY_CONFLICT);
    });
  });

  describe('listMessages', () => {
    it('phòng đã đóng → 409 CHAT_NOT_OPEN (docs/02: chat ẩn danh khoá khi kết thúc)', async () => {
      matchingService.findSessionById.mockResolvedValue(makeSession(300));
      const err = await service
        .listMessages(me, 'session-1', 20)
        .catch((e) => e);
      expectDomainError(err, SoulMatchErrors.CHAT_NOT_OPEN);
    });

    it('cursor hỏng → 400 CURSOR_INVALID', async () => {
      const err = await service
        .listMessages(me, 'session-1', 20, 'not-a-cursor')
        .catch((e) => e);
      expectDomainError(err, SoulMatchErrors.CURSOR_INVALID);
    });

    it('cursor hợp lệ nhưng seq không phải số → 400 CURSOR_INVALID', async () => {
      const err = await service
        .listMessages(me, 'session-1', 20, encodeCursor({ seq: 'abc' }))
        .catch((e) => e);
      expectDomainError(err, SoulMatchErrors.CURSOR_INVALID);
    });
  });

  describe('rate — mutual like → Friendship trong cùng transaction', () => {
    const like = { verdict: SoulMatchVerdict.Like };

    it('đối phương chưa rate → lưu rating, chưa matched, không tạo friendship', async () => {
      const result = await service.rate(me, 'session-1', like);
      expect(result).toEqual({
        verdict: SoulMatchVerdict.Like,
        matched: false,
      });
      expect(friendService.ensureFriendship).not.toHaveBeenCalled();
    });

    it('đối phương đã like → ensureFriendship trong manager của transaction, matched=true', async () => {
      manager.findOneBy
        .mockResolvedValueOnce(null) // rating của mình chưa có
        .mockResolvedValueOnce(
          Object.assign(new SoulMatchRating(), {
            sessionId: 'session-1',
            raterUserId: PARTNER_ID,
            verdict: SoulMatchVerdict.Like,
          }),
        );
      const result = await service.rate(me, 'session-1', like);
      expect(result.matched).toBe(true);
      expect(friendService.ensureFriendship).toHaveBeenCalledWith(
        manager,
        me.userId,
        PARTNER_ID,
        'soul_match',
      );
    });

    it('mutual like MỚI → publish soul.matched cho CẢ 2 sau commit', async () => {
      manager.findOneBy.mockResolvedValueOnce(null).mockResolvedValueOnce(
        Object.assign(new SoulMatchRating(), {
          verdict: SoulMatchVerdict.Like,
        }),
      );
      await service.rate(me, 'session-1', like);
      expect(redis.publish).toHaveBeenCalledTimes(2);
      const channels = redis.publish.mock.calls.map(
        ([channel]: [string]) => channel,
      );
      expect(channels).toEqual(
        expect.arrayContaining([
          'realtime:user:user-me',
          `realtime:user:${PARTNER_ID}`,
        ]),
      );
      for (const [, raw] of redis.publish.mock.calls as [string, string][]) {
        expect((JSON.parse(raw) as { event: string }).event).toBe(
          'soul.matched',
        );
      }
    });

    it('đối phương rate boring → không tạo friendship', async () => {
      manager.findOneBy.mockResolvedValueOnce(null).mockResolvedValueOnce(
        Object.assign(new SoulMatchRating(), {
          verdict: SoulMatchVerdict.Boring,
        }),
      );
      const result = await service.rate(me, 'session-1', like);
      expect(result.matched).toBe(false);
      expect(friendService.ensureFriendship).not.toHaveBeenCalled();
    });

    it('mình rate rude → không check đối phương, không friendship', async () => {
      const result = await service.rate(me, 'session-1', {
        verdict: SoulMatchVerdict.Rude,
      });
      expect(result.matched).toBe(false);
      expect(friendService.ensureFriendship).not.toHaveBeenCalled();
      expect(manager.findOneBy).toHaveBeenCalledTimes(1); // chỉ tra rating của mình
    });

    it('replay cùng verdict → idempotent, không insert lại', async () => {
      manager.findOneBy.mockResolvedValueOnce(
        Object.assign(new SoulMatchRating(), {
          verdict: SoulMatchVerdict.Like,
        }),
      );
      const result = await service.rate(me, 'session-1', like);
      expect(result.verdict).toBe(SoulMatchVerdict.Like);
      expect(manager.save).not.toHaveBeenCalled();
    });

    it('đổi verdict → 409 RATING_CONFLICT (immutable — chống thăm dò rồi đổi lại)', async () => {
      manager.findOneBy.mockResolvedValueOnce(
        Object.assign(new SoulMatchRating(), {
          verdict: SoulMatchVerdict.Boring,
        }),
      );
      const err = await service.rate(me, 'session-1', like).catch((e) => e);
      expectDomainError(err, SoulMatchErrors.RATING_CONFLICT);
    });

    it('double-submit song song thua unique → replay theo dòng đã commit', async () => {
      manager.findOneBy.mockResolvedValueOnce(null);
      manager.save.mockRejectedValue(uniqueViolation());
      ratingRepo.findOneBy.mockResolvedValue(
        Object.assign(new SoulMatchRating(), {
          verdict: SoulMatchVerdict.Like,
        }),
      );
      const result = await service.rate(me, 'session-1', like);
      expect(result.verdict).toBe(SoulMatchVerdict.Like);
    });

    it('phòng đã đóng → 409 RATING_NOT_OPEN', async () => {
      matchingService.findSessionById.mockResolvedValue(makeSession(300));
      const err = await service.rate(me, 'session-1', like).catch((e) => e);
      expectDomainError(err, SoulMatchErrors.RATING_NOT_OPEN);
    });

    it('phase rating (hết giờ chat) vẫn rate được', async () => {
      matchingService.findSessionById.mockResolvedValue(makeSession(200));
      const result = await service.rate(me, 'session-1', like);
      expect(result.verdict).toBe(SoulMatchVerdict.Like);
    });
  });

  describe('getPartnerProfile — unlock qua Friendship', () => {
    it('chưa match → 403 PARTNER_LOCKED', async () => {
      const err = await service
        .getPartnerProfile(me, 'session-1')
        .catch((e) => e);
      expectDomainError(err, SoulMatchErrors.PARTNER_LOCKED);
      expect(userService.getByIdOrThrow).not.toHaveBeenCalled();
    });

    it('đã match → trả PublicProfileDto của đối phương', async () => {
      friendService.areFriends.mockResolvedValue(true);
      const profile = await service.getPartnerProfile(me, 'session-1');
      expect(userService.getByIdOrThrow).toHaveBeenCalledWith(PARTNER_ID);
      expect(profile.id).toBe(PARTNER_ID);
      // DTO công khai — không có birthDate/region/trustScore
      expect(profile).not.toHaveProperty('birthDate');
      expect(profile).not.toHaveProperty('trustScore');
    });
  });

  describe('SoulMessageDto — ẩn danh', () => {
    it('map senderRole tương đối với người xem, KHÔNG lộ userId', () => {
      const message = Object.assign(new SoulChatMessage(), {
        id: 'msg-1',
        sessionId: 'session-1',
        senderUserId: PARTNER_ID,
        content: 'hi',
        createdAt: new Date(),
      });
      const dto = SoulMessageDto.from(message, me.userId);
      expect(dto.senderRole).toBe(SoulSenderRole.Partner);
      expect(JSON.stringify(dto)).not.toContain(PARTNER_ID);
      expect(SoulMessageDto.from(message, PARTNER_ID).senderRole).toBe(
        SoulSenderRole.Me,
      );
    });
  });
});
