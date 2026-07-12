import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
} from 'typeorm';

/** Outbox Pattern (docs/03 § 3.6): event ghi cùng DB transaction với nghiệp vụ, relay publish Kafka sau. */
@Entity({ name: 'outbox_events' })
@Index('idx_outbox_events_unpublished', ['createdAt'], {
  where: 'published_at IS NULL',
})
export class OutboxEvent {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ length: 128 })
  topic!: string;

  @Column({ length: 64 })
  eventType!: string;

  @Column({ type: 'jsonb' })
  payload!: Record<string, unknown>;

  @Column({ type: 'int', default: 0 })
  attempts!: number;

  @Column({ type: 'timestamptz', nullable: true })
  publishedAt!: Date | null;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt!: Date;
}
