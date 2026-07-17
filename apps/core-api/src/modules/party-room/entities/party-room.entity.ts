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

export enum PartyRoomCategory {
  Talk = 'talk',
  Sing = 'sing',
  Friend = 'friend',
  Study = 'study',
  Other = 'other',
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
  /** Moderator/admin chủ động kết thúc phòng vi phạm hoặc cần can thiệp vận hành. */
  AdminClosed = 'admin_closed',
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

  @Column({ type: 'varchar', length: 16, default: PartyRoomCategory.Talk })
  category!: PartyRoomCategory;

  /**
   * SNAPSHOT URL LiveKit chốt theo region của HOST lúc tạo phòng (GĐ7 — ADR 0005): room sống
   * trên 1 node/region, mọi participant vào sau nhận đúng URL này bất kể region của họ và bất
   * kể LIVEKIT_REGION_URLS đổi giữa chừng — đổi config không bao giờ di chuyển phòng đang sống.
   * NULL = phòng tạo trước migration này → fallback LIVEKIT_URL lúc trả về.
   */
  @Column({ type: 'varchar', length: 512, nullable: true })
  livekitUrl!: string | null;

  @Column({ type: 'varchar', length: 32, nullable: true })
  closeReason!: PartyRoomCloseReason | null;

  @Column({ type: 'timestamptz', nullable: true })
  closedAt!: Date | null;

  /**
   * Set khi webhook SFU báo host mất kết nối NGOÀI Ý MUỐN (participant_left) — KHÔNG set khi
   * host chủ động rời qua REST (đóng ngay, không qua cột này). Còn active + không null nghĩa là
   * đang trong grace period chờ host tự kết nối lại; host rejoin thì clear về null (cùng
   * transaction lock với `joinRoom`); hết PARTY_HOST_DISCONNECT_GRACE_SECONDS mà vẫn không null
   * thì grace-check đóng phòng với lý do `host_left` như cũ (party-room-service.md § 4).
   */
  @Column({ type: 'timestamptz', nullable: true })
  hostDisconnectedAt!: Date | null;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt!: Date;
}
