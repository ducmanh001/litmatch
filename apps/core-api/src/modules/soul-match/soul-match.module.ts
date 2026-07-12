import { Inject, Module, OnApplicationShutdown } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { SoulMatchController } from './soul-match.controller';
import { SoulMatchService } from './soul-match.service';
import { SoulChatMessage } from './entities/soul-chat-message.entity';
import { SoulMatchRating } from './entities/soul-match-rating.entity';
import {
  SOUL_MATCH_REDIS,
  soulMatchRedisProvider,
} from './redis/soul-match-redis.provider';
import { FriendModule } from '../friend';
import { MatchingModule } from '../matching';
import { UserModule } from '../user';

import type Redis from 'ioredis';

@Module({
  imports: [
    TypeOrmModule.forFeature([SoulChatMessage, SoulMatchRating]),
    MatchingModule, // đọc MatchSession qua MatchingService (read-only)
    FriendModule, // tạo/tra Friendship qua FriendService — không tự ghi bảng friendships
    UserModule,
  ],
  controllers: [SoulMatchController],
  providers: [SoulMatchService, soulMatchRedisProvider],
  exports: [], // chưa module nào cần gọi Soul Match — export tối thiểu (docs/05 § 5.3)
})
export class SoulMatchModule implements OnApplicationShutdown {
  constructor(@Inject(SOUL_MATCH_REDIS) private readonly redis: Redis) {}

  async onApplicationShutdown(): Promise<void> {
    await this.redis.quit().catch(() => undefined);
  }
}
