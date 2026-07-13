import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
} from 'typeorm';

export enum BlockAction {
  Blocked = 'blocked',
  Unblocked = 'unblocked',
}

/**
 * Log block/unblock — append-only theo cặp (blocker, blocked). Trạng thái "đang block" hiện
 * tại = dòng mới nhất theo cặp (docs/services/safety-service.md § 1) — không dùng bảng mutable
 * để giữ toàn bộ lịch sử cho điều tra T&S, khác Wallet/Ledger vì ở đây không có bài toán tái
 * tính tổng, 1 lookup có index đã đủ rẻ.
 */
@Entity({ name: 'blocks' })
@Index(['blockerUserId', 'blockedUserId', 'createdAt'])
export class Block {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'uuid' })
  blockerUserId!: string;

  @Column({ type: 'uuid' })
  blockedUserId!: string;

  @Column({ length: 16 })
  action!: BlockAction;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt!: Date;
}
