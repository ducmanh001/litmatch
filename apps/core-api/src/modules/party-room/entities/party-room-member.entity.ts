import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

export enum PartyRole {
  Host = 'host',
  Speaker = 'speaker',
  Audience = 'audience',
}

/**
 * Membership của 1 user trong 1 phòng. Active = `leftAt IS NULL`; rejoin sau khi rời tạo
 * ROW MỚI (giữ lịch sử). Bất biến enforce ở DB bằng partial unique index (migration
 * 1752700000000): 1 membership active/(room,user) + 1 phòng active/user toàn hệ thống.
 */
@Entity({ name: 'party_room_members' })
@Index('idx_party_members_disconnect_grace', ['disconnectedAt', 'id'], {
  where: '"left_at" IS NULL AND "disconnected_at" IS NOT NULL',
})
export class PartyRoomMember {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'uuid' })
  roomId!: string;

  @Column({ type: 'uuid' })
  userId!: string;

  @Column({ type: 'varchar', length: 16 })
  role!: PartyRole;

  /** Host đã mời audience lên speaker nhưng người đó chưa đồng ý — không phải role publish. */
  @Column({ type: 'boolean', default: false })
  speakerInvitePending!: boolean;

  @Column({ type: 'timestamptz', default: () => 'now()' })
  joinedAt!: Date;

  @Column({ type: 'timestamptz', nullable: true })
  leftAt!: Date | null;

  /**
   * Rớt LiveKit ngoài ý muốn nhưng vẫn còn trong grace period. REST leave chủ động đặt
   * `leftAt` ngay; reconnect trước khi hết grace xoá mốc này và giữ nguyên membership.
   */
  @Column({ type: 'timestamptz', nullable: true })
  disconnectedAt!: Date | null;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt!: Date;
}
