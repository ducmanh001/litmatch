import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryColumn,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

/** Catalog nạp web Việt Nam. Giá/DIA chỉ được đọc từ đây, không nhận từ client. */
@Entity({ name: 'payos_packages' })
export class PayosPackage {
  @PrimaryColumn({ length: 64 })
  packageId!: string;

  @Column({ type: 'bigint' })
  amountVnd!: string;

  @Column({ type: 'bigint' })
  diamonds!: string;

  @Column({ default: true })
  active!: boolean;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt!: Date;
}

export enum PayosPaymentOrderStatus {
  Pending = 'pending',
  Paid = 'paid',
  Cancelled = 'cancelled',
  Expired = 'expired',
}

/**
 * Intent payOS tách khỏi ledger: tạo link chưa mint DIA; chỉ webhook verified mới ghi sổ.
 * amount/diamonds/packageId là snapshot bất biến tại thời điểm tạo order.
 */
@Entity({ name: 'payos_payment_orders' })
export class PayosPaymentOrder {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Index('idx_payos_payment_orders_user_created')
  @Column({ type: 'uuid' })
  userId!: string;

  @Column({ length: 64 })
  packageId!: string;

  @Column({ type: 'bigint' })
  amountVnd!: string;

  @Column({ type: 'bigint' })
  diamonds!: string;

  @Column({ type: 'varchar', length: 3, default: 'VND' })
  currency!: string;

  /** bigint nhưng serialize string — JavaScript không làm tròn mã thanh toán. */
  @Column({
    type: 'bigint',
    unique: true,
    default: () => "nextval('payos_order_code_seq')",
  })
  orderCode!: string;

  @Column({ length: 255, unique: true })
  idempotencyKey!: string;

  @Column({ type: 'char', length: 64 })
  requestHash!: string;

  @Column({
    type: 'varchar',
    length: 32,
    default: PayosPaymentOrderStatus.Pending,
  })
  status!: PayosPaymentOrderStatus;

  @Column({ type: 'varchar', length: 128, nullable: true, unique: true })
  paymentLinkId!: string | null;

  @Column({ type: 'text', nullable: true })
  checkoutUrl!: string | null;

  @Column({ type: 'text', nullable: true })
  qrCode!: string | null;

  @Column({ type: 'timestamptz' })
  expiresAt!: Date;

  /** Mỗi order chỉ được nối với đúng một transaction credit. */
  @Column({ type: 'uuid', nullable: true, unique: true })
  transactionId!: string | null;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt!: Date;
}
