import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

/** Một endpoint browser/user — endpoint được coi là credential, không log ra ngoài adapter. */
@Entity({ name: 'web_push_subscriptions' })
@Index('uq_web_push_subscriptions_endpoint', ['endpoint'], { unique: true })
@Index('idx_web_push_subscriptions_user', ['userId'])
export class WebPushSubscription {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'uuid' })
  userId!: string;

  @Column({ type: 'text' })
  endpoint!: string;

  @Column({ type: 'varchar', length: 255 })
  p256dh!: string;

  @Column({ type: 'varchar', length: 255 })
  auth!: string;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt!: Date;
}
