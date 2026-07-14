import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Nearby (docs/services/discovery-service.md § Nearby, W4 của
 * docs/plans/2026-07-14-plan-6-tinh-nang-social-discovery.md § 3.1). Mở rộng module `discovery`
 * (W1 đã có, browse-only). `user_locations.lat_quantized`/`lon_quantized` PHẢI đã quantize ~500m
 * ở tầng ứng dụng trước khi ghi — bảng này không có ràng buộc ép quantize (không có cách check
 * ở DB mà không hardcode grid size), tin tưởng vào `NearbyService.setLocation`. Spatial MVP:
 * btree index thường trên (lat, lon) cho bounding-box prefilter + haversine tính ở app/SQL —
 * không cần PostGIS (nâng cấp sau không đổi data model).
 */
export class DiscoveryNearby1754600000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE discovery_settings (
        user_id        uuid PRIMARY KEY REFERENCES users(id),
        nearby_visible boolean NOT NULL DEFAULT false
      )
    `);

    await queryRunner.query(`
      CREATE TABLE user_locations (
        user_id       uuid PRIMARY KEY REFERENCES users(id),
        lat_quantized double precision NOT NULL,
        lon_quantized double precision NOT NULL,
        updated_at    timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT chk_user_locations_lat CHECK (lat_quantized BETWEEN -90 AND 90),
        CONSTRAINT chk_user_locations_lon CHECK (lon_quantized BETWEEN -180 AND 180)
      )
    `);
    await queryRunner.query(`
      CREATE INDEX idx_user_locations_lat_lon ON user_locations (lat_quantized, lon_quantized)
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS user_locations`);
    await queryRunner.query(`DROP TABLE IF EXISTS discovery_settings`);
  }
}
