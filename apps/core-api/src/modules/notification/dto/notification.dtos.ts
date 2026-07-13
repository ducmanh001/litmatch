import { ApiProperty } from '@nestjs/swagger';
import type { CursorPage } from '@litmatch/common-dtos';

import {
  Notification,
  NotificationType,
} from '../entities/notification.entity';

export class NotificationDto {
  @ApiProperty() id!: string;
  @ApiProperty({ enum: NotificationType }) type!: NotificationType;
  @ApiProperty({ type: Object }) payload!: Record<string, unknown>;
  @ApiProperty({ nullable: true }) readAt!: Date | null;
  @ApiProperty() createdAt!: Date;

  static from(notification: Notification): NotificationDto {
    const dto = new NotificationDto();
    dto.id = notification.id;
    dto.type = notification.type;
    dto.payload = notification.payload;
    dto.readAt = notification.readAt;
    dto.createdAt = notification.createdAt;
    return dto;
  }
}

export class NotificationsPageDto {
  @ApiProperty({ type: [NotificationDto] }) items!: NotificationDto[];
  @ApiProperty({ nullable: true }) nextCursor!: string | null;

  static from(page: CursorPage<Notification>): NotificationsPageDto {
    const dto = new NotificationsPageDto();
    dto.items = page.items.map(NotificationDto.from);
    dto.nextCursor = page.meta.nextCursor;
    return dto;
  }
}

export class UnreadCountDto {
  @ApiProperty() count!: number;
}
