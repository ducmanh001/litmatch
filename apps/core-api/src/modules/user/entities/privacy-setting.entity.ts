import { Column, Entity, PrimaryColumn } from 'typeorm';

/** Privacy preference của chính user — không compose vào PublicProfileDto. */
@Entity({ name: 'user_privacy_settings' })
export class PrivacySetting {
  @PrimaryColumn({ type: 'uuid' })
  userId!: string;

  @Column({ type: 'boolean', default: true })
  showOnlineStatus!: boolean;

  @Column({ type: 'boolean', default: true })
  showDistance!: boolean;

  @Column({ type: 'boolean', default: false })
  searchableByPhone!: boolean;

  @Column({ type: 'boolean', default: false })
  hideProfile!: boolean;
}
