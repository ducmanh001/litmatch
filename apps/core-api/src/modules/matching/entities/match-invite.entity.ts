import { Column, Entity, Index } from 'typeorm';

import { BaseAppEntity } from '../../../common/entities/base.entity';
import { MatchType } from './match-ticket.entity';

export enum MatchInviteStatus {
  Pending = 'pending',
  Accepted = 'accepted',
  Declined = 'declined',
  Expired = 'expired',
  Cancelled = 'cancelled',
}

/**
 * Transition hợp lệ duy nhất (mirror `MATCH_TICKET_TRANSITIONS`) — mọi chuyển trạng thái PHẢI
 * đi qua bảng này, không tin client gửi trạng thái đích (docs/services/matching-service.md § Invite).
 */
export const MATCH_INVITE_TRANSITIONS: Readonly<
  Record<MatchInviteStatus, readonly MatchInviteStatus[]>
> = {
  [MatchInviteStatus.Pending]: [
    MatchInviteStatus.Accepted,
    MatchInviteStatus.Declined,
    MatchInviteStatus.Expired,
    MatchInviteStatus.Cancelled,
  ],
  [MatchInviteStatus.Accepted]: [],
  [MatchInviteStatus.Declined]: [],
  [MatchInviteStatus.Expired]: [],
  [MatchInviteStatus.Cancelled]: [],
};

/**
 * CTA "mời Voice/Soul Match" (W4, docs/services/matching-service.md § Invite) — directed invite,
 * KHÔNG phải friend-request flow mới. Accept tạo trực tiếp `MatchTicket`/`MatchSession` (bỏ qua
 * hàng đợi shard), tái dùng nguyên các bước validate của `tryPair` (gender preference,
 * `interactionPolicy.canPair`, invariant 1-user-1-queue qua `uq_match_tickets_active_user`) —
 * từ lúc đó luồng y hệt auto-match, không có state/logic riêng ở Soul Match/Calling.
 *
 * Unique 1 invite PENDING/cặp (`uq_match_invites_pending_pair`) — không phải cơ chế rate-limit
 * chính (đó là Redis, xem `matching.constants.ts`), chỉ chặn thêm trường hợp double-submit.
 */
@Entity({ name: 'match_invites' })
@Index('idx_match_invites_invitee_status', ['inviteeUserId', 'status'])
export class MatchInvite extends BaseAppEntity {
  @Index('idx_match_invites_inviter')
  @Column({ type: 'uuid' })
  inviterUserId!: string;

  @Column({ type: 'uuid' })
  inviteeUserId!: string;

  @Column({ type: 'varchar', length: 8 })
  matchType!: MatchType;

  @Column({ type: 'varchar', length: 16, default: MatchInviteStatus.Pending })
  status!: MatchInviteStatus;

  @Column({ type: 'timestamptz' })
  expiresAt!: Date;

  @Column({ type: 'timestamptz', nullable: true })
  respondedAt!: Date | null;

  /** Set khi accept thành công — trỏ tới `MatchSession` tạo ra từ invite này. */
  @Column({ type: 'uuid', nullable: true })
  sessionId!: string | null;
}
