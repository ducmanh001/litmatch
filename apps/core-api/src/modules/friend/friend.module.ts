import { Inject, Module, OnApplicationShutdown } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { FriendController } from './friend.controller';
import { FriendService } from './friend.service';
import { Conversation } from './entities/conversation.entity';
import { Friendship } from './entities/friendship.entity';
import { Message } from './entities/message.entity';
import {
  FRIEND_REDIS,
  friendRedisProvider,
} from './redis/friend-redis.provider';
import { ConversationService } from './services/conversation.service';
import { UserModule } from '../user';

import type Redis from 'ioredis';

/**
 * Friend (docs/services/friend-service.md): Friendship (từ Soul Match) + Chat 1-1 lâu dài
 * (Conversation/Message). `UserModule` chỉ để hydrate profile công khai ở GET /friends.
 */
@Module({
  imports: [
    TypeOrmModule.forFeature([Friendship, Conversation, Message]),
    UserModule,
  ],
  controllers: [FriendController],
  providers: [FriendService, ConversationService, friendRedisProvider],
  exports: [FriendService],
})
export class FriendModule implements OnApplicationShutdown {
  constructor(@Inject(FRIEND_REDIS) private readonly redis: Redis) {}

  async onApplicationShutdown(): Promise<void> {
    await this.redis.quit().catch(() => undefined);
  }
}
