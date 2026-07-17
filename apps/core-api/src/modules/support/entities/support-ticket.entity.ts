import { Column, Entity, Index } from 'typeorm';

import { BaseAppEntity } from '../../../common/entities/base.entity';

export enum SupportTicketCategory {
  Feedback = 'feedback',
  Bug = 'bug',
  Idea = 'idea',
}

export enum SupportTicketStatus {
  Open = 'open',
  InProgress = 'in_progress',
  Resolved = 'resolved',
  Closed = 'closed',
}

@Entity({ name: 'support_tickets' })
@Index('idx_support_tickets_user_created', ['userId', 'createdAt'])
@Index('idx_support_tickets_status_created', ['status', 'createdAt'])
@Index('uq_support_ticket_user_idempotency', ['userId', 'idempotencyKey'], {
  unique: true,
})
export class SupportTicket extends BaseAppEntity {
  @Column({ type: 'uuid' })
  userId!: string;

  @Column({ type: 'varchar', length: 16 })
  category!: SupportTicketCategory;

  @Column({ type: 'varchar', length: 2000 })
  message!: string;

  @Column({ type: 'varchar', length: 16, default: SupportTicketStatus.Open })
  status!: SupportTicketStatus;

  @Column({ type: 'varchar', length: 2000, nullable: true })
  staffResponse!: string | null;

  @Column({ type: 'varchar', length: 128 })
  idempotencyKey!: string;
}
