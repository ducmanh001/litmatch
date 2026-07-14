import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { ShortVideoController } from './short-video.controller';
import { ShortVideoService } from './short-video.service';
import { VideoSweeperService } from './jobs/video-sweeper.service';
import { VideoRankingService } from './jobs/video-ranking.service';
import { Video } from './entities/video.entity';
import { VideoView } from './entities/video-view.entity';
import { VideoComment } from './entities/video-comment.entity';
import { VideoReaction } from './entities/video-reaction.entity';
import {
  DevVideoStorageProvider,
  VideoStoragePort,
} from './ports/video-storage.port';
import {
  DevVideoTranscodeProvider,
  VideoTranscodePort,
} from './ports/video-transcode.port';
import { SafetyModule } from '../safety';

@Module({
  imports: [
    TypeOrmModule.forFeature([Video, VideoView, VideoComment, VideoReaction]),
    SafetyModule,
  ],
  controllers: [ShortVideoController],
  providers: [
    ShortVideoService,
    VideoSweeperService,
    VideoRankingService,
    // Đổi sang provider thật (Cloudflare Stream/Mux, ADR sau) khi tích hợp — giống DevSmsProvider.
    { provide: VideoStoragePort, useClass: DevVideoStorageProvider },
    { provide: VideoTranscodePort, useClass: DevVideoTranscodeProvider },
  ],
  exports: [ShortVideoService],
})
export class ShortVideoModule {}
