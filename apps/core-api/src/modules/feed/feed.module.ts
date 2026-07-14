import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { FeedController } from './feed.controller';
import { FeedService } from './feed.service';
import { StoryController } from './story.controller';
import { Comment } from './entities/comment.entity';
import { Post } from './entities/post.entity';
import { Reaction } from './entities/reaction.entity';
import { Story } from './entities/story.entity';
import { StoryView } from './entities/story-view.entity';
import { StorySweeperService } from './jobs/story-sweeper.service';
import { StoryService } from './services/story.service';
import { FriendModule } from '../friend';
import { NotificationModule } from '../notification';
import { SafetyModule } from '../safety';

@Module({
  imports: [
    TypeOrmModule.forFeature([Post, Comment, Reaction, Story, StoryView]),
    SafetyModule, // block cắt điểm chạm — docs/services/feed-service.md § 3
    FriendModule, // areFriends()/listFriendIds() cho audience=friends + Stories reply→DM
    NotificationModule, // in-app notification post_liked/post_commented (notification-service.md § 3)
  ],
  controllers: [FeedController, StoryController],
  providers: [FeedService, StoryService, StorySweeperService],
  exports: [], // chưa module nào cần gọi Feed
})
export class FeedModule {}
