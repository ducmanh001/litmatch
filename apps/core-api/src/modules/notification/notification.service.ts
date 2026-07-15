import { HttpStatus, Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import {
  buildCursorPage,
  decodeCursor,
  isValidSeqCursor,
} from '@litmatch/common-dtos';
import { DomainException } from '@litmatch/common-exceptions';
import { EntityManager, Repository } from 'typeorm';

import { NotificationErrors } from './notification.errors';
import { Notification, NotificationType } from './entities/notification.entity';
import { PushPort } from './ports/push-provider';

import type { CursorPage, CursorPageQueryDto } from '@litmatch/common-dtos';

export interface CreateNotificationInput {
  userId: string;
  type: NotificationType;
  payload: Record<string, unknown>;
}

/**
 * Facade Notification (docs/services/notification-service.md): module sinh sự kiện gọi thẳng
 * qua DI (không Outbox/Kafka — chỉ 1 consumer, vẫn modular monolith). `createWithManager` cho
 * caller có transaction sẵn (atomic cùng hành động gốc); `create` cho caller không chia sẻ được
 * transaction (Friend message) — tự transaction riêng, gọi NGAY SAU khi hành động gốc persist.
 */
@Injectable()
export class NotificationService {
  private readonly logger = new Logger(NotificationService.name);

  constructor(
    @InjectRepository(Notification)
    private readonly notificationRepo: Repository<Notification>,
    private readonly pushPort: PushPort,
  ) {}

  async createWithManager(
    manager: EntityManager,
    input: CreateNotificationInput,
  ): Promise<Notification> {
    return manager.save(
      manager.create(Notification, { ...input, readAt: null }),
    );
  }

  async create(input: CreateNotificationInput): Promise<Notification> {
    return this.createWithManager(this.notificationRepo.manager, input);
  }

  /**
   * Best-effort — gọi SAU khi Notification đã commit (docs/services/notification-service.md § 1).
   * Không bao giờ throw ra caller: push fail không được làm hỏng luồng nghiệp vụ gốc.
   */
  async sendPush(notification: Notification): Promise<void> {
    try {
      await this.pushPort.send(notification);
    } catch (err) {
      this.logger.warn(
        `Push notification ${notification.id} lỗi (bỏ qua, in-app vẫn còn): ${
          err instanceof Error ? err.message : String(err)
        }`,
      );
    }
  }

  async list(
    userId: string,
    query: CursorPageQueryDto,
  ): Promise<CursorPage<Notification>> {
    const qb = this.notificationRepo
      .createQueryBuilder('n')
      .where('n.userId = :userId', { userId });

    if (query.cursor) {
      const payload = decodeCursor<{ seq?: unknown }>(query.cursor);
      if (!isValidSeqCursor(payload)) {
        throw new DomainException(
          NotificationErrors.CURSOR_INVALID,
          'Cursor không hợp lệ',
          HttpStatus.BAD_REQUEST,
        );
      }
      qb.andWhere('n.seq < :afterSeq', { afterSeq: payload.seq });
    }

    const rows = await qb
      .orderBy('n.seq', 'DESC')
      .take(query.limit + 1)
      .getMany();
    return buildCursorPage(rows, query.limit, (last) => ({ seq: last.seq }));
  }

  async unreadCount(userId: string): Promise<number> {
    return this.notificationRepo
      .createQueryBuilder('n')
      .where('n.userId = :userId', { userId })
      .andWhere('n.readAt IS NULL')
      .getCount();
  }

  async markRead(userId: string, notificationId: string): Promise<void> {
    const notification = await this.notificationRepo.findOneBy({
      id: notificationId,
    });
    if (!notification || notification.userId !== userId) {
      throw new DomainException(
        NotificationErrors.NOTIFICATION_NOT_FOUND,
        'Không tìm thấy notification',
        HttpStatus.NOT_FOUND,
      );
    }
    if (notification.readAt) return; // idempotent
    await this.notificationRepo.update(
      { id: notificationId },
      { readAt: new Date() },
    );
  }
}
