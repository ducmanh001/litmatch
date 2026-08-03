import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
} from 'typeorm';

/**
 * Bình luận realtime trong Party Room — append-only để retry/poll có thứ tự ổn định và giữ
 * bằng chứng cho Trust & Safety; không xoá theo vòng đời LiveKit room.
 */
@Entity({ name: 'party_room_comments' })
@Index('idx_party_room_comments_room_seq', ['roomId', 'seq'])
export class PartyRoomComment {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  /** DB cấp thứ tự cho cursor, không dùng createdAt vì nhiều comment có thể cùng mili-giây. */
  @Column({ type: 'bigint', generated: 'increment', update: false })
  seq!: string;

  @Column({ type: 'uuid' })
  roomId!: string;

  @Column({ type: 'uuid' })
  senderUserId!: string;

  @Column({ type: 'text' })
  content!: string;

  /** Prefix `party:comment:{userId}:{roomId}:{clientKey}` — unique DB để retry không nhân đôi. */
  @Column({ type: 'varchar', length: 255 })
  idempotencyKey!: string;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt!: Date;
}
