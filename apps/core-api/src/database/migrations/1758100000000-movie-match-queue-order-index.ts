import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Index thứ tự hàng đợi Movie Match ẩn danh, giống `idx_palm_match_queue_order` của Palm Match: matcher chọn ứng
 * viên cũ nhất theo `(queued_at, user_id)` và dọn entry quá hạn theo `queued_at`. Thiếu index này thì mỗi lượt
 * join quét cả bảng (trước đây còn nằm trong một advisory lock toàn cục). Bảng chỉ chứa người đang chờ (nhỏ,
 * dọn liên tục) nên tạo thường, không cần CONCURRENTLY.
 */
export class MovieMatchQueueOrderIndex1758100000000 implements MigrationInterface {
  name = 'MovieMatchQueueOrderIndex1758100000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_movie_match_queue_order
      ON movie_match_queue_entries (queued_at, user_id)
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('DROP INDEX IF EXISTS idx_movie_match_queue_order');
  }
}
