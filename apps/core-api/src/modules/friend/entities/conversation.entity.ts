import { Column, Entity, Index } from 'typeorm';

import { BaseAppEntity } from '../../../common/entities/base.entity';

/**
 * Chat 1-1 lâu dài giữa 2 user ĐÃ LÀ BẠN — khác chat ẩn danh tạm thời của Soul Match
 * (docs/02). Cặp canonical `userLowId < userHighId` giống hệt `Friendship`, được tạo
 * ATOMICALLY cùng Friendship (`FriendService.ensureFriendship`) — bất biến: tồn tại
 * Friendship cho 1 cặp ⟺ tồn tại Conversation cho đúng cặp đó (docs/services/friend-service.md § 1).
 */
@Entity({ name: 'conversations' })
@Index('uq_conversations_pair', ['userLowId', 'userHighId'], { unique: true })
export class Conversation extends BaseAppEntity {
  @Column({ type: 'uuid' })
  userLowId!: string;

  @Column({ type: 'uuid' })
  userHighId!: string;

  /** Chỉ dùng để sort danh sách chat gần nhất ở GET /friends — không phải nguồn sự thật gì khác. */
  @Column({ type: 'timestamptz', nullable: true })
  lastMessageAt!: Date | null;
}
