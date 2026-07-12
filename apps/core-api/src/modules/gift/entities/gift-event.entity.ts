import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
} from 'typeorm';

/**
 * Log 1 lần tặng quà — ghi trong CÙNG DB transaction với 2 chân ledger (qua
 * `EconomyService.sendGift` withinTransaction). `transactionId` unique: 1 GiftEvent ↔ 1
 * Transaction tiền, replay idempotency trả lại đúng event cũ. Số tiền/điểm ở đây chỉ là
 * SNAPSHOT hiển thị — nguồn sự thật vẫn là ledger_entries (docs/02).
 */
@Entity({ name: 'gift_events' })
export class GiftEvent {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'uuid' })
  giftId!: string;

  @Column({ type: 'uuid' })
  roomId!: string;

  @Column({ type: 'uuid' })
  senderUserId!: string;

  @Column({ type: 'uuid' })
  receiverUserId!: string;

  @Column({ type: 'int' })
  priceDiamond!: number;

  /** 0 khi người nhận là guest (docs/06 § Gift: guest không nhận điểm quy đổi). */
  @Column({ type: 'int' })
  pointsAwarded!: number;

  /** Snapshot GIFT_POINTS_RATE_PERCENT tại thời điểm tặng (economy-service.md § 6). */
  @Column({ type: 'int' })
  pointsRatePercent!: number;

  @Column({ type: 'uuid', unique: true })
  transactionId!: string;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt!: Date;
}
