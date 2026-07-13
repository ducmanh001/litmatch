import {
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { CursorPageQueryDto } from '@litmatch/common-dtos';

import { NotificationService } from './notification.service';
import { NotificationsPageDto, UnreadCountDto } from './dto/notification.dtos';
import { CurrentUser } from '../../common/decorators/current-user.decorator';

import type { AuthenticatedUser } from '../../common/decorators/current-user.decorator';

@ApiTags('notifications')
@ApiBearerAuth()
@Controller('notifications')
export class NotificationController {
  constructor(private readonly notificationService: NotificationService) {}

  @Get()
  @ApiOperation({ summary: 'Danh sách notification, mới nhất trước' })
  @ApiOkResponse({ type: NotificationsPageDto })
  async list(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: CursorPageQueryDto,
  ): Promise<NotificationsPageDto> {
    return NotificationsPageDto.from(
      await this.notificationService.list(user.userId, query),
    );
  }

  @Get('unread-count')
  @ApiOperation({ summary: 'Số notification chưa đọc — dùng cho badge' })
  @ApiOkResponse({ type: UnreadCountDto })
  async unreadCount(
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<UnreadCountDto> {
    const count = await this.notificationService.unreadCount(user.userId);
    return { count };
  }

  @Post(':notificationId/read')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Đánh dấu đã đọc — idempotent, chỉ chủ sở hữu' })
  async markRead(
    @CurrentUser() user: AuthenticatedUser,
    @Param('notificationId', ParseUUIDPipe) notificationId: string,
  ): Promise<void> {
    await this.notificationService.markRead(user.userId, notificationId);
  }
}
