import { Inject, Module, OnApplicationShutdown } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { FriendModule } from '../friend';
import { MovieSessionActiveParticipant } from './entities/movie-session-active-participant.entity';
import { MovieSession } from './entities/movie-session.entity';
import { MovieMatchController } from './movie-match.controller';
import { MovieMatchService } from './movie-match.service';
import {
  MOVIE_MATCH_REDIS,
  movieMatchRedisProvider,
} from './redis/movie-match-redis.provider';

import type Redis from 'ioredis';

/**
 * Movie Match (docs/services/movie-match-service.md): phiên xem chung 2 người đã là bạn.
 * `FriendModule`: verify quan hệ bạn (`areFriends`) — không tự chế quan hệ mới. KHÔNG phụ
 * thuộc Party Room/Calling (không SFU, không tiền — spec § 1).
 */
@Module({
  imports: [
    TypeOrmModule.forFeature([MovieSession, MovieSessionActiveParticipant]),
    FriendModule,
  ],
  controllers: [MovieMatchController],
  providers: [MovieMatchService, movieMatchRedisProvider],
  exports: [MovieMatchService],
})
export class MovieMatchModule implements OnApplicationShutdown {
  constructor(@Inject(MOVIE_MATCH_REDIS) private readonly redis: Redis) {}

  async onApplicationShutdown(): Promise<void> {
    await this.redis.quit().catch(() => undefined);
  }
}
