import { Column, Entity, PrimaryGeneratedColumn } from 'typeorm';

/**
 * Catalog mood preset — data-driven (seed migration, pattern `avatar_assets`); danh sách
 * hiển thị được cho user chọn là `active=true`, sắp theo `sortOrder`.
 */
@Entity({ name: 'mood_presets' })
export class MoodPreset {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ length: 64, unique: true })
  code!: string;

  @Column({ length: 128 })
  label!: string;

  @Column({ length: 8 })
  emoji!: string;

  @Column({ default: true })
  active!: boolean;

  @Column({ type: 'int', default: 0 })
  sortOrder!: number;
}
