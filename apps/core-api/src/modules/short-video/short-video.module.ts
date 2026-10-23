import { Inject, Module, OnApplicationShutdown } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';

import { ShortVideoController } from './short-video.controller';
import { ShortVideoService } from './short-video.service';
import { VideoSweeperService } from './jobs/video-sweeper.service';
import { VideoRankingService } from './jobs/video-ranking.service';
import { VideoCounterFlushService } from './jobs/video-counter-flush.service';
import { ShortVideoRetentionJob } from './jobs/short-video-retention.job';
import { Video } from './entities/video.entity';
import { VideoView } from './entities/video-view.entity';
import { VideoComment } from './entities/video-comment.entity';
import { VideoReaction } from './entities/video-reaction.entity';
import { VideoStoragePort } from './ports/video-storage.port';
import { VideoTranscodePort } from './ports/video-transcode.port';
import { VideoCounterBufferPort } from './ports/video-counter-buffer.port';
import {
  DisabledVideoCounterBuffer,
  RedisVideoCounterBufferAdapter,
} from './redis/redis-video-counter-buffer.adapter';
import { createCoreRedisClient } from '../../common/redis/core-redis-client';
import {
  createVideoStorageAdapter,
  createVideoTranscodeAdapter,
} from './ports/video-provider.factory';
import { FriendModule } from '../friend';

import type { CoreApiEnv } from '../../config/env.validation';
import { SafetyModule } from '../safety';
import { UserModule } from '../user';

@Module({
  imports: [
    TypeOrmModule.forFeature([Video, VideoView, VideoComment, VideoReaction]),
    // Graph bạn bè cho feed "Đang theo dõi" (video.html) — nguồn follow duy nhất hiện có.
    FriendModule,
    SafetyModule,
    UserModule, // compose public author một batch cho video/comment
  ],
  controllers: [ShortVideoController],
  providers: [
    ShortVideoService,
    VideoSweeperService,
    VideoRankingService,
    VideoCounterFlushService,
    ShortVideoRetentionJob,
    {
      // Bộ đệm counter (ADR 0013): tắt mặc định; bật bằng VIDEO_COUNTER_BUFFER_ENABLED (dùng Redis lõi REDIS_URL).
      provide: VideoCounterBufferPort,
      inject: [ConfigService],
      useFactory: (config: ConfigService<CoreApiEnv, true>) =>
        config.getOrThrow('VIDEO_COUNTER_BUFFER_ENABLED', { infer: true })
          ? new RedisVideoCounterBufferAdapter(
              createCoreRedisClient(
                config.getOrThrow('REDIS_URL', { infer: true }),
              ),
            )
          : new DisabledVideoCounterBuffer(),
    },
    {
      provide: VideoStoragePort,
      inject: [ConfigService],
      useFactory: createVideoStorageAdapter,
    },
    {
      provide: VideoTranscodePort,
      inject: [ConfigService],
      useFactory: createVideoTranscodeAdapter,
    },
  ],
  exports: [ShortVideoService],
})
export class ShortVideoModule implements OnApplicationShutdown {
  constructor(
    @Inject(VideoCounterBufferPort)
    private readonly counterBuffer: VideoCounterBufferPort,
  ) {}

  async onApplicationShutdown(): Promise<void> {
    await this.counterBuffer.close?.();
  }
}
