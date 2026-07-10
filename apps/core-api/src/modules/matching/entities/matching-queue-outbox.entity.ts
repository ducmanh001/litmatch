import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';

/**
 * Durable signal that the Redis queue projection for a ticket must be reconciled with Postgres.
 * The relay always reads the CURRENT ticket row, so an old event cannot resurrect a cancelled ticket.
 */
@Entity({ name: 'matching_queue_outbox' })
export class MatchingQueueOutbox {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Index('idx_matching_queue_outbox_ticket')
  @Column({ type: 'uuid' })
  ticketId!: string;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt!: Date;

  @Index('idx_matching_queue_outbox_pending')
  @Column({ type: 'timestamptz', nullable: true })
  processedAt!: Date | null;

  @Column({ type: 'int', default: 0 })
  attempts!: number;
}
