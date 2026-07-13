import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { FeedController } from './feed.controller';
import { FeedService } from './feed.service';
import { Comment } from './entities/comment.entity';
import { Post } from './entities/post.entity';
import { Reaction } from './entities/reaction.entity';
import { NotificationModule } from '../notification';
import { SafetyModule } from '../safety';

@Module({
  imports: [
    TypeOrmModule.forFeature([Post, Comment, Reaction]),
    SafetyModule, // block cắt điểm chạm — docs/services/feed-service.md § 3
    NotificationModule, // in-app notification post_liked/post_commented (notification-service.md § 3)
  ],
  controllers: [FeedController],
  providers: [FeedService],
  exports: [], // chưa module nào cần gọi Feed
})
export class FeedModule {}
