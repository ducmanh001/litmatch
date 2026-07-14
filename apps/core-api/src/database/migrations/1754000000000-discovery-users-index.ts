import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Discovery browse (docs/services/discovery-service.md) — index phục vụ filter
 * gender/birth_date + status trên `users`. Discovery không sở hữu bảng `users`
 * (User module sở hữu) nhưng cần index truy vấn cho query mới; không phải thay đổi schema
 * nghiệp vụ, chỉ thêm index. KHÔNG có `region` — field đó đang là region hạ tầng (LiveKit
 * multi-region/matching shard, ADR 0005), không phải khu vực dating cấp thành phố; filter
 * khu vực dạng thành phố thuộc về Nearby (W5, toạ độ quantize riêng), xem docs/plans/
 * 2026-07-14-plan-6-tinh-nang-social-discovery.md § 6.
 */
export class DiscoveryUsersIndex1754000000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE INDEX idx_users_discovery_browse
      ON users (status, gender, birth_date)
    `);
    // Keyset cursor (created_at, id) cho browse (không có cột seq trên users)
    await queryRunner.query(`
      CREATE INDEX idx_users_created_at_id ON users (created_at DESC, id DESC)
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS idx_users_created_at_id`);
    await queryRunner.query(`DROP INDEX IF EXISTS idx_users_discovery_browse`);
  }
}
