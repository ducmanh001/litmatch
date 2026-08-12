import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';

import { ShortVideoController } from './short-video.controller';
import { ShortVideoService } from './short-video.service';
import { VideoSweeperService } from './jobs/video-sweeper.service';
import { VideoRankingService } from './jobs/video-ranking.service';
import { Video } from './entities/video.entity';
import { VideoView } from './entities/video-view.entity';
import { VideoComment } from './entities/video-comment.entity';
import { VideoReaction } from './entities/video-reaction.entity';
import { VideoStoragePort } from './ports/video-storage.port';
import { VideoTranscodePort } from './ports/video-transcode.port';
import {
  createVideoStorageAdapter,
  createVideoTranscodeAdapter,
} from './ports/video-provider.factory';
import { FriendModule } from '../friend';
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
export class ShortVideoModule {}
