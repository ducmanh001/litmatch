import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

/**
 * Catalog quà (docs/services/gift-service.md § 2). Giá là DATA trong DB (đổi bằng
 * UPDATE/admin) — server ĐỌC LẠI giá tại đúng thời điểm tặng, không tin giá client cache
 * (docs/10 § Gift). `code` là khoá ổn định cho client map asset/animation.
 */
@Entity({ name: 'gifts' })
export class Gift {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'varchar', length: 64, unique: true })
  code!: string;

  @Column({ type: 'varchar', length: 128 })
  name!: string;

  @Column({ type: 'int' })
  priceDiamond!: number;

  @Column({ type: 'boolean', default: true })
  active!: boolean;

  @Column({ type: 'int', default: 0 })
  sortOrder!: number;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt!: Date;
}
