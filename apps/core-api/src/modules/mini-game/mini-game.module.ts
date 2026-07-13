import { Inject, Module, OnApplicationShutdown } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { FriendModule } from '../friend';
import { MiniGameActiveParticipant } from './entities/mini-game-active-participant.entity';
import { MiniGameSession } from './entities/mini-game-session.entity';
import { MiniGameController } from './mini-game.controller';
import { MiniGameService } from './mini-game.service';
import {
  MINI_GAME_REDIS,
  miniGameRedisProvider,
} from './redis/mini-game-redis.provider';

import type Redis from 'ioredis';

/**
 * Mini Game (docs/services/mini-game-service.md): oẳn tù tì 2 người đã là bạn. `FriendModule`:
 * verify quan hệ bạn (`areFriends`) — không tự chế quan hệ mới. Ưu tiên thấp nhất toàn dự án
 * (spec § 0) — chỉ 1 game (`rock_paper_scissors`) ở bản này.
 */
@Module({
  imports: [
    TypeOrmModule.forFeature([MiniGameSession, MiniGameActiveParticipant]),
    FriendModule,
  ],
  controllers: [MiniGameController],
  providers: [MiniGameService, miniGameRedisProvider],
  exports: [MiniGameService],
})
export class MiniGameModule implements OnApplicationShutdown {
  constructor(@Inject(MINI_GAME_REDIS) private readonly redis: Redis) {}

  async onApplicationShutdown(): Promise<void> {
    await this.redis.quit().catch(() => undefined);
  }
}
