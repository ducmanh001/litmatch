import { Column, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';

export enum PalmMatchCategory {
  Love = 'love',
  Career = 'career',
  Health = 'health',
  General = 'general',
}

/**
 * Catalog nội dung bói toán giải trí (docs/services/palm-match-service.md § 2) — KHÔNG có bảng
 * lịch sử, kết quả deterministic theo (userId, category, ngày server) tính lại mỗi lần gọi.
 * `content` có thể chứa placeholder `{name}` được thay bằng `targetName` nếu client truyền vào.
 * `isActive=false` cho phép tắt 1 dòng nội dung lỗi mà không xoá (giữ dấu vết nếu cần audit).
 */
@Entity({ name: 'palm_reading_templates' })
@Index('idx_palm_reading_templates_category_active', ['category', 'isActive'])
export class PalmReadingTemplate {
  @PrimaryGeneratedColumn()
  id!: number;

  @Column({ type: 'varchar', length: 16 })
  category!: PalmMatchCategory;

  @Column({ type: 'text' })
  content!: string;

  @Column({ name: 'is_active', default: true })
  isActive!: boolean;
}
