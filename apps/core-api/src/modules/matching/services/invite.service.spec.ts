import { InviteService } from './invite.service';
import { MatchingErrors } from '../matching.errors';
import {
  MatchInvite,
  MatchInviteStatus,
} from '../entities/match-invite.entity';
import {
  MatchTicket,
  MatchTicketStatus,
} from '../entities/match-ticket.entity';
import {
  MatchSession,
  MatchSessionStatus,
} from '../entities/match-session.entity';
import { MatchType } from '../entities/match-ticket.entity';
import { UserStatus } from '../../user';

import type { ConfigService } from '@nestjs/config';
import type { DataSource, EntityManager, Repository } from 'typeorm';
import type Redis from 'ioredis';
import type { CoreApiEnv } from '../../../config/env.validation';
import type { AuthenticatedUser } from '../../../common/decorators/current-user.decorator';
import type { NotificationService } from '../../notification';
import type { SafetyService } from '../../safety';
import type { User, UserService } from '../../user';
import type { MatchInteractionPolicy } from '../ports/interaction-policy';

const CONFIG: Record<string, unknown> = {
  MATCHING_INVITE_RATE_LIMIT_PER_HOUR: 10,
  MATCHING_INVITE_TTL_SECONDS: 3600,
  MATCHING_AGE_BAND_SIZE: 5,
  MATCHING_TRUST_PENALTY_MS_PER_POINT: 2000,
  MATCHING_TRUST_PENALTY_MAX_MS: 120_000,
};
const configStub = {
  getOrThrow: (key: string) => {
    if (!(key in CONFIG)) throw new Error(`missing config ${key}`);
    return CONFIG[key];
  },
} as unknown as ConfigService<CoreApiEnv, true>;

const inviter: AuthenticatedUser = {
  userId: 'user-inviter',
  isGuest: false,
  role: 'user',
};
const invitee: AuthenticatedUser = {
  userId: 'user-invitee',
  isGuest: false,
  role: 'user',
};

function makeInvite(overrides: Partial<MatchInvite> = {}): MatchInvite {
  return Object.assign(new MatchInvite(), {
    id: 'invite-1',
    inviterUserId: inviter.userId,
    inviteeUserId: invitee.userId,
    matchType: MatchType.Voice,
    status: MatchInviteStatus.Pending,
    expiresAt: new Date(Date.now() + 3_600_000),
    respondedAt: null,
    sessionId: null,
    createdAt: new Date('2026-07-14T00:00:00Z'),
    updatedAt: new Date('2026-07-14T00:00:00Z'),
    ...overrides,
  });
}

function makeUser(overrides: Partial<User> = {}): User {
  return {
    id: inviter.userId,
    status: UserStatus.Active,
    region: 'VN',
    birthDate: '2000-01-01',
    trustScore: 100,
    ...overrides,
  } as User;
}

describe('InviteService (unit — mock repo/redis/deps)', () => {
  let inviteRepo: jest.Mocked<
    Pick<
      Repository<MatchInvite>,
      'save' | 'create' | 'findOneBy' | 'createQueryBuilder'
    >
  >;
  let userService: { getByIdOrThrow: jest.Mock };
  let safetyService: { getHiddenUserIds: jest.Mock };
  let notificationService: { create: jest.Mock; sendPush: jest.Mock };
  let interactionPolicy: { canPair: jest.Mock };
  let redis: { eval: jest.Mock; publish: jest.Mock };
  let manager: {
    findOne: jest.Mock;
    find: jest.Mock;
    findOneByOrFail: jest.Mock;
    save: jest.Mock;
    create: jest.Mock;
  };
  let dataSource: { transaction: jest.Mock };
  let service: InviteService;

  beforeEach(() => {
    inviteRepo = {
      save: jest.fn(async (i) => i as MatchInvite),
      create: jest.fn((input) => Object.assign(new MatchInvite(), input)),
      findOneBy: jest.fn(),
      createQueryBuilder: jest.fn(),
    } as never;
    userService = {
      getByIdOrThrow: jest.fn(async () => makeUser({ id: invitee.userId })),
    };
    safetyService = { getHiddenUserIds: jest.fn(async () => []) };
    notificationService = {
      create: jest.fn(async (input) => ({ id: 'notif-1', ...input })),
      sendPush: jest.fn(async () => undefined),
    };
    interactionPolicy = { canPair: jest.fn(async () => true) };
    redis = { eval: jest.fn(async () => 1), publish: jest.fn(async () => 1) };
    manager = {
      findOne: jest.fn(),
      find: jest.fn(async () => []),
      findOneByOrFail: jest.fn(),
      save: jest.fn(async (t) => t),
      create: jest.fn((_entity, input) => input),
    };
    dataSource = {
      transaction: jest.fn(async (cb: (m: EntityManager) => Promise<unknown>) =>
        cb(manager as unknown as EntityManager),
      ),
    };

    service = new InviteService(
      dataSource as unknown as DataSource,
      inviteRepo as unknown as Repository<MatchInvite>,
      userService as unknown as UserService,
      safetyService as unknown as SafetyService,
      notificationService as unknown as NotificationService,
      interactionPolicy as unknown as MatchInteractionPolicy,
      redis as unknown as Redis,
      configStub,
    );
  });

  describe('createInvite', () => {
    it('tự mời chính mình → INVITE_TARGET_UNAVAILABLE, không chạm Redis/DB', async () => {
      await expect(
        service.createInvite(inviter, {
          inviteeUserId: inviter.userId,
          matchType: MatchType.Voice,
        }),
      ).rejects.toMatchObject({
        code: MatchingErrors.INVITE_TARGET_UNAVAILABLE,
      });
      expect(redis.eval).not.toHaveBeenCalled();
      expect(inviteRepo.save).not.toHaveBeenCalled();
    });

    it('vượt rate limit → INVITE_RATE_LIMITED, không check hidden-set/insert', async () => {
      redis.eval.mockResolvedValue(-1);
      await expect(
        service.createInvite(inviter, {
          inviteeUserId: invitee.userId,
          matchType: MatchType.Voice,
        }),
      ).rejects.toMatchObject({ code: MatchingErrors.INVITE_RATE_LIMITED });
      expect(safetyService.getHiddenUserIds).not.toHaveBeenCalled();
    });

    it('invitee trong hidden-set (block/report) → INVITE_TARGET_UNAVAILABLE, oracle-safe', async () => {
      safetyService.getHiddenUserIds.mockResolvedValue([invitee.userId]);
      await expect(
        service.createInvite(inviter, {
          inviteeUserId: invitee.userId,
          matchType: MatchType.Voice,
        }),
      ).rejects.toMatchObject({
        code: MatchingErrors.INVITE_TARGET_UNAVAILABLE,
      });
      expect(inviteRepo.save).not.toHaveBeenCalled();
    });

    it('invitee không tồn tại/banned → CÙNG mã lỗi với hidden-set (oracle-safe)', async () => {
      userService.getByIdOrThrow.mockRejectedValue(new Error('not found'));
      await expect(
        service.createInvite(inviter, {
          inviteeUserId: invitee.userId,
          matchType: MatchType.Voice,
        }),
      ).rejects.toMatchObject({
        code: MatchingErrors.INVITE_TARGET_UNAVAILABLE,
      });
    });

    it('unique violation (đã có invite pending tới đúng người) → INVITE_ALREADY_PENDING', async () => {
      inviteRepo.save.mockRejectedValue({ code: '23505' });
      await expect(
        service.createInvite(inviter, {
          inviteeUserId: invitee.userId,
          matchType: MatchType.Voice,
        }),
      ).rejects.toMatchObject({ code: MatchingErrors.INVITE_ALREADY_PENDING });
    });

    it('tạo thành công → gửi notification + push cho invitee', async () => {
      await service.createInvite(inviter, {
        inviteeUserId: invitee.userId,
        matchType: MatchType.Voice,
      });
      expect(notificationService.create).toHaveBeenCalledWith(
        expect.objectContaining({ userId: invitee.userId }),
      );
      expect(notificationService.sendPush).toHaveBeenCalled();
    });
  });

  describe('getInvite', () => {
    it('không phải inviter/invitee → INVITE_FORBIDDEN', async () => {
      inviteRepo.findOneBy.mockResolvedValue(makeInvite());
      const stranger: AuthenticatedUser = {
        userId: 'stranger',
        isGuest: false,
        role: 'user',
      };
      await expect(
        service.getInvite(stranger, 'invite-1'),
      ).rejects.toMatchObject({
        code: MatchingErrors.INVITE_FORBIDDEN,
      });
    });

    it('không tồn tại → INVITE_NOT_FOUND', async () => {
      inviteRepo.findOneBy.mockResolvedValue(null);
      await expect(service.getInvite(inviter, 'nope')).rejects.toMatchObject({
        code: MatchingErrors.INVITE_NOT_FOUND,
      });
    });
  });

  describe('declineInvite / cancelInvite (ownership + lazy-expire)', () => {
    it('declineInvite: không phải invitee → INVITE_FORBIDDEN', async () => {
      manager.findOne.mockResolvedValue(makeInvite());
      await expect(
        service.declineInvite(inviter, 'invite-1'),
      ).rejects.toMatchObject({
        code: MatchingErrors.INVITE_FORBIDDEN,
      });
    });

    it('cancelInvite: không phải inviter → INVITE_FORBIDDEN', async () => {
      manager.findOne.mockResolvedValue(makeInvite());
      await expect(
        service.cancelInvite(invitee, 'invite-1'),
      ).rejects.toMatchObject({
        code: MatchingErrors.INVITE_FORBIDDEN,
      });
    });

    it('đã hết hạn (chưa kịp sweeper) → INVITE_INVALID_TRANSITION khi decline', async () => {
      manager.findOne.mockResolvedValue(
        makeInvite({ expiresAt: new Date(Date.now() - 1000) }),
      );
      await expect(
        service.declineInvite(invitee, 'invite-1'),
      ).rejects.toMatchObject({
        code: MatchingErrors.INVITE_INVALID_TRANSITION,
      });
    });

    it('decline hợp lệ → chuyển Declined + set respondedAt', async () => {
      manager.findOne.mockResolvedValue(makeInvite());
      const result = await service.declineInvite(invitee, 'invite-1');
      expect(result.status).toBe(MatchInviteStatus.Declined);
      expect(result.respondedAt).not.toBeNull();
    });
  });

  describe('acceptInvite', () => {
    it('không phải invitee → INVITE_FORBIDDEN', async () => {
      manager.findOne.mockResolvedValue(makeInvite());
      await expect(
        service.acceptInvite(inviter, 'invite-1'),
      ).rejects.toMatchObject({
        code: MatchingErrors.INVITE_FORBIDDEN,
      });
    });

    it('canPair=false → tự chuyển Declined + INVITE_TARGET_UNAVAILABLE (block phát sinh sau khi mời)', async () => {
      manager.findOne.mockResolvedValue(makeInvite());
      interactionPolicy.canPair.mockResolvedValue(false);
      await expect(
        service.acceptInvite(invitee, 'invite-1'),
      ).rejects.toMatchObject({
        code: MatchingErrors.INVITE_TARGET_UNAVAILABLE,
      });
      const saved = manager.save.mock.calls.find(
        (c) => c[0] instanceof MatchInvite,
      )?.[0] as MatchInvite;
      expect(saved.status).toBe(MatchInviteStatus.Declined);
    });

    it('1 trong 2 bên banned → USER_BANNED', async () => {
      manager.findOne.mockResolvedValue(makeInvite());
      manager.find.mockResolvedValue([
        makeUser({ id: inviter.userId, status: UserStatus.Active }),
        makeUser({ id: invitee.userId, status: UserStatus.Banned }),
      ]);
      await expect(
        service.acceptInvite(invitee, 'invite-1'),
      ).rejects.toMatchObject({
        code: MatchingErrors.USER_BANNED,
      });
    });

    it('unique violation UQ_ACTIVE_USER khi tạo ticket → INVITE_ACCEPT_USER_BUSY', async () => {
      manager.findOne.mockResolvedValue(makeInvite());
      manager.find.mockResolvedValue([
        makeUser({ id: inviter.userId }),
        makeUser({ id: invitee.userId }),
      ]);
      manager.save.mockImplementation(async (arg) => {
        // Ticket draft được save dưới dạng mảng [ticketInviter, ticketInvitee] — session/invite
        // save từng cái 1 (không phải mảng), nên check Array.isArray tách đúng bước tạo ticket.
        if (Array.isArray(arg)) {
          throw {
            code: '23505',
            constraint: 'uq_match_tickets_active_user',
            driverError: { constraint: 'uq_match_tickets_active_user' },
          };
        }
        return arg;
      });
      await expect(
        service.acceptInvite(invitee, 'invite-1'),
      ).rejects.toMatchObject({
        code: MatchingErrors.INVITE_ACCEPT_USER_BUSY,
      });
    });

    it('đã Accepted từ trước (replay) → đọc lại session/ticket cũ, không tạo lại', async () => {
      const sessionId = 'session-1';
      manager.findOne.mockResolvedValue(
        makeInvite({ status: MatchInviteStatus.Accepted, sessionId }),
      );
      manager.findOneByOrFail.mockImplementation(async (entity: unknown) => {
        if (entity === MatchSession) {
          return Object.assign(new MatchSession(), {
            id: sessionId,
            status: MatchSessionStatus.PendingConfirm,
          });
        }
        return Object.assign(new MatchTicket(), {
          id: 'ticket-invitee-1',
          status: MatchTicketStatus.Matched,
        });
      });

      const result = await service.acceptInvite(invitee, 'invite-1');
      expect(result.session.id).toBe(sessionId);
      expect(result.inviteeTicketId).toBe('ticket-invitee-1');
      expect(manager.find).not.toHaveBeenCalled(); // không chạy lại luồng tạo mới
    });
  });

  describe('listReceivedInvites', () => {
    it('cursor sai định dạng → INVITE_CURSOR_INVALID', async () => {
      const qb = {
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnThis(),
        addOrderBy: jest.fn().mockReturnThis(),
        take: jest.fn().mockReturnThis(),
        getMany: jest.fn(async () => []),
      };
      inviteRepo.createQueryBuilder.mockReturnValue(qb as never);
      await expect(
        service.listReceivedInvites(invitee, { limit: 20, cursor: 'garbage' }),
      ).rejects.toMatchObject({ code: MatchingErrors.INVITE_CURSOR_INVALID });
    });
  });
});
