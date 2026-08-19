/**
 * Public API của Friend module — module khác CHỈ import từ đây (arch test enforce).
 * Chủ sở hữu dữ liệu `Friendship` (docs/02): Soul Match tạo quan hệ QUA service này,
 * không tự ghi bảng friendships.
 */
export { FriendModule } from './friend.module';
export { FriendService } from './friend.service';
export type {
  EnsureFriendshipResult,
  FriendListEntry,
  FriendMessageSeed,
} from './friend.service';
export { Friendship, FriendshipSource } from './entities/friendship.entity';
export { Conversation } from './entities/conversation.entity';
export { ConversationStreak } from './entities/conversation-streak.entity';
export { Message } from './entities/message.entity';
export { ProfileFollow } from './entities/profile-follow.entity';
export { ProfileChatContact } from './entities/profile-chat-contact.entity';
export type { MessageAttachment } from './entities/message.entity';
export { ConversationService } from './services/conversation.service';
export { ProfileSocialService } from './services/profile-social.service';
export { StreakService } from './services/streak.service';
// MessageDto: hợp đồng public để module khác trả response giống hệt Friend Chat khi tự gọi
// sendMessage qua DI (vd Feed reply-to-story) — docs/16 § 16.4.
export { MessageDto, MessageAttachmentDto } from './dto/friend.dtos';
