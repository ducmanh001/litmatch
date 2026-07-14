import { Inject, Module, OnApplicationShutdown } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { FriendController } from './friend.controller';
import { FriendService } from './friend.service';
import { Conversation } from './entities/conversation.entity';
import { ConversationStreak } from './entities/conversation-streak.entity';
import { Friendship } from './entities/friendship.entity';
import { Message } from './entities/message.entity';
import { StreakWarningJob } from './jobs/streak-warning.job';
import {
  FRIEND_REDIS,
  friendRedisProvider,
} from './redis/friend-redis.provider';
import { ConversationService } from './services/conversation.service';
import { StreakService } from './services/streak.service';
import { NotificationModule } from '../notification';
import { SafetyModule } from '../safety';
import { UserModule } from '../user';

import type Redis from 'ioredis';

/**
 * Friend (docs/services/friend-service.md): Friendship (từ Soul Match) + Chat 1-1 lâu dài
 * (Conversation/Message). `UserModule` chỉ để hydrate profile công khai ở GET /friends.
 * `SafetyModule`: guard block 2 chiều trước khi gửi message (docs/services/safety-service.md § 6).
 * `NotificationModule`: in-app notification khi có tin nhắn mới (docs/services/notification-service.md § 3).
 */
@Module({
  imports: [
    TypeOrmModule.forFeature([
      Friendship,
      Conversation,
      Message,
      ConversationStreak,
    ]),
    UserModule,
    SafetyModule,
    NotificationModule,
  ],
  controllers: [FriendController],
  providers: [
    FriendService,
    ConversationService,
    StreakService,
    StreakWarningJob,
    friendRedisProvider,
  ],
  exports: [FriendService],
})
export class FriendModule implements OnApplicationShutdown {
  constructor(@Inject(FRIEND_REDIS) private readonly redis: Redis) {}

  async onApplicationShutdown(): Promise<void> {
    await this.redis.quit().catch(() => undefined);
  }
}
