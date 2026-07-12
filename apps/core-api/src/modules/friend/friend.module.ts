import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { FriendService } from './friend.service';
import { Friendship } from './entities/friendship.entity';

/**
 * Slice tối thiểu (docs/services/soul-match-service.md § 3): chưa có controller —
 * API list bạn/Chat 1-1 thuộc mục roadmap "Friend + Chat 1-1", thêm khi tới lượt.
 */
@Module({
  imports: [TypeOrmModule.forFeature([Friendship])],
  providers: [FriendService],
  exports: [FriendService],
})
export class FriendModule {}
