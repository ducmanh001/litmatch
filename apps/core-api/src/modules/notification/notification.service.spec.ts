import { DomainException } from '@litmatch/common-exceptions';

import { NotificationService } from './notification.service';
import { NotificationErrors } from './notification.errors';
import { Notification, NotificationType } from './entities/notification.entity';

import type { Repository } from 'typeorm';
import type { PushPort } from './ports/push-provider';

function makeNotification(overrides: Partial<Notification> = {}): Notification {
  return Object.assign(new Notification(), {
    id: 'notif-1',
    seq: '1',
    userId: 'user-1',
    type: NotificationType.FriendMessage,
    payload: {},
    readAt: null,
    createdAt: new Date('2026-07-13T00:00:00Z'),
    ...overrides,
  });
}

describe('NotificationService (unit — mock repo/pushPort)', () => {
  let notificationRepo: {
    findOneBy: jest.Mock;
    update: jest.Mock;
    createQueryBuilder: jest.Mock;
    manager: unknown;
  };
  let pushPort: { send: jest.Mock };
  let service: NotificationService;

  function expectDomainError(err: unknown, code: string): void {
    expect(err).toBeInstanceOf(DomainException);
    expect((err as DomainException).code).toBe(code);
  }

  beforeEach(() => {
    notificationRepo = {
      findOneBy: jest.fn(async () => null),
      update: jest.fn(async () => undefined),
      createQueryBuilder: jest.fn(),
      manager: {
        save: jest.fn(async (e) => e),
        create: jest.fn((_entity, input) =>
          Object.assign(new Notification(), input),
        ),
      },
    };
    pushPort = { send: jest.fn(async () => undefined) };
    service = new NotificationService(
      notificationRepo as unknown as Repository<Notification>,
      pushPort as unknown as PushPort,
    );
  });

  describe('create / createWithManager', () => {
    it('create() dùng manager mặc định của repo, readAt = null', async () => {
      const notification = await service.create({
        userId: 'user-1',
        type: NotificationType.FriendMessage,
        payload: { conversationId: 'c1' },
      });
      expect(notification.userId).toBe('user-1');
      expect(notification.readAt).toBeNull();
    });
  });

  describe('sendPush — best-effort', () => {
    it('push thành công → gọi đúng pushPort.send', async () => {
      const n = makeNotification();
      await service.sendPush(n);
      expect(pushPort.send).toHaveBeenCalledWith(n);
    });

    it('push lỗi → nuốt lỗi, KHÔNG throw ra caller', async () => {
      pushPort.send.mockRejectedValue(new Error('fcm down'));
      await expect(
        service.sendPush(makeNotification()),
      ).resolves.toBeUndefined();
    });
  });

  describe('markRead', () => {
    it('không tồn tại → 404', async () => {
      notificationRepo.findOneBy.mockResolvedValue(null);
      expectDomainError(
        await service.markRead('user-1', 'x').catch((e) => e),
        NotificationErrors.NOTIFICATION_NOT_FOUND,
      );
    });

    it('không phải chủ sở hữu → CÙNG 404 (chống oracle)', async () => {
      notificationRepo.findOneBy.mockResolvedValue(
        makeNotification({ userId: 'other' }),
      );
      expectDomainError(
        await service.markRead('user-1', 'notif-1').catch((e) => e),
        NotificationErrors.NOTIFICATION_NOT_FOUND,
      );
      expect(notificationRepo.update).not.toHaveBeenCalled();
    });

    it('đã đọc rồi → idempotent, không update lại', async () => {
      notificationRepo.findOneBy.mockResolvedValue(
        makeNotification({ readAt: new Date() }),
      );
      await service.markRead('user-1', 'notif-1');
      expect(notificationRepo.update).not.toHaveBeenCalled();
    });

    it('chưa đọc → set readAt', async () => {
      notificationRepo.findOneBy.mockResolvedValue(makeNotification());
      await service.markRead('user-1', 'notif-1');
      expect(notificationRepo.update).toHaveBeenCalledWith(
        { id: 'notif-1' },
        { readAt: expect.any(Date) },
      );
    });
  });

  describe('list', () => {
    it('cursor hỏng → 400 CURSOR_INVALID', async () => {
      const qb = {
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnThis(),
        take: jest.fn().mockReturnThis(),
        getMany: jest.fn(async () => []),
      };
      notificationRepo.createQueryBuilder.mockReturnValue(qb);
      expectDomainError(
        await service
          .list('user-1', { limit: 20, cursor: 'rác' })
          .catch((e) => e),
        NotificationErrors.CURSOR_INVALID,
      );
    });

    it('cursor hợp lệ → lọc theo seq < afterSeq', async () => {
      const qb = {
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnThis(),
        take: jest.fn().mockReturnThis(),
        getMany: jest.fn(async () => []),
      };
      notificationRepo.createQueryBuilder.mockReturnValue(qb);
      const cursor = Buffer.from(JSON.stringify({ seq: '5' })).toString(
        'base64url',
      );
      await service.list('user-1', { limit: 20, cursor });
      expect(qb.andWhere).toHaveBeenCalledWith('n.seq < :afterSeq', {
        afterSeq: '5',
      });
    });
  });
});
