import { Column, Entity, PrimaryColumn } from 'typeorm';

/**
 * Trạng thái CÁ NHÂN của 1 thành viên trong 1 conversation — mỗi bên một dòng, KHÔNG phải
 * trạng thái chung của conversation (khác `Conversation.lastMessageAt`). Lazy: chỉ tồn tại
 * sau lần đầu user đọc/mute; vắng dòng ⟺ chưa đọc gì và không mute.
 *
 * - `lastReadAt`: mốc đã đọc — unread count = message của ĐỐI PHƯƠNG sau mốc này.
 * - `mutedAt`: đang tắt thông báo hội thoại này (notification friend_message bị bỏ qua,
 *   message vẫn gửi bình thường) — NULL là đang bật.
 */
@Entity({ name: 'conversation_member_states' })
export class ConversationMemberState {
  @PrimaryColumn({ type: 'uuid' })
  conversationId!: string;

  @PrimaryColumn({ type: 'uuid' })
  userId!: string;

  @Column({ type: 'timestamptz', nullable: true })
  lastReadAt!: Date | null;

  @Column({ type: 'timestamptz', nullable: true })
  mutedAt!: Date | null;
}
