import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { SoulMatchController } from './soul-match.controller';
import { SoulMatchService } from './soul-match.service';
import { SoulChatMessage } from './entities/soul-chat-message.entity';
import { SoulMatchRating } from './entities/soul-match-rating.entity';
import { FriendModule } from '../friend';
import { MatchingModule } from '../matching';
import { UserModule } from '../user';

@Module({
  imports: [
    TypeOrmModule.forFeature([SoulChatMessage, SoulMatchRating]),
    MatchingModule, // đọc MatchSession qua MatchingService (read-only)
    FriendModule, // tạo/tra Friendship qua FriendService — không tự ghi bảng friendships
    UserModule,
  ],
  controllers: [SoulMatchController],
  providers: [SoulMatchService],
  exports: [], // chưa module nào cần gọi Soul Match — export tối thiểu (docs/05 § 5.3)
})
export class SoulMatchModule {}
