import {
  Column,
  CreateDateColumn,
  Entity,
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
export class PartyRoomMember {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'uuid' })
  roomId!: string;

  @Column({ type: 'uuid' })
  userId!: string;

  @Column({ type: 'varchar', length: 16 })
  role!: PartyRole;

  @Column({ type: 'timestamptz', default: () => 'now()' })
  joinedAt!: Date;

  @Column({ type: 'timestamptz', nullable: true })
  leftAt!: Date | null;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt!: Date;
}
