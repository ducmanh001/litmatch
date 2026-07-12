import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

export enum PartyRoomStatus {
  Active = 'active',
  Closed = 'closed',
}

export enum PartyRoomCloseReason {
  /** Host rời/rớt — GĐ3 chọn đóng phòng thay vì transfer host (party-room-service.md § 4). */
  HostLeft = 'host_left',
  /** LiveKit room_finished (empty timeout hoặc deleteRoom). */
  Finished = 'finished',
  /** Sweeper đóng phòng không còn member active (webhook rớt). */
  Swept = 'swept',
  /** Tạo LiveKit room thất bại ngay sau khi tạo row — compensate. */
  Error = 'error',
}

/**
 * Phòng party multi-user trên LiveKit (docs/services/party-room-service.md).
 * `speakerLimit` là SNAPSHOT config lúc tạo phòng — đổi config không retro phòng đang sống;
 * đây là giới hạn cứng theo docs/03 § 3.8.A (consumer tăng N×(N-1)).
 */
@Entity({ name: 'party_rooms' })
@Index('idx_party_rooms_status_created', ['status', 'createdAt'])
export class PartyRoom {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'uuid' })
  hostUserId!: string;

  @Column({ type: 'varchar', length: 500 })
  title!: string;

  @Column({ type: 'varchar', length: 16, default: PartyRoomStatus.Active })
  status!: PartyRoomStatus;

  @Column({ type: 'int' })
  speakerLimit!: number;

  @Column({ type: 'varchar', length: 32, nullable: true })
  closeReason!: PartyRoomCloseReason | null;

  @Column({ type: 'timestamptz', nullable: true })
  closedAt!: Date | null;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt!: Date;
}
