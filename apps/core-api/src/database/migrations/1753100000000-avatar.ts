import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Giai đoạn 4 — Avatar (docs/services/avatar-service.md).
 * - `avatar_assets`: catalog item multi-layer, giá là DATA (seed dưới đây, đổi bằng UPDATE/admin).
 * - `uq_user_avatar_items_pair`: 1 user chỉ sở hữu 1 lần/item — chặn double-grant.
 * - `user_avatar_configs`: PK = user_id, mỗi slot 1 cột nullable — item đang trang bị.
 * - Seed có ĐÚNG 1 item free/slot để `initDefaultConfig` luôn có default hợp lệ.
 */
export class Avatar1753100000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE avatar_assets (
        id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        slot          varchar(16)   NOT NULL,
        code          varchar(64)   NOT NULL,
        name          varchar(128)  NOT NULL,
        image_url     varchar(2048) NOT NULL,
        z_index       int           NOT NULL,
        price_diamond int           NOT NULL DEFAULT 0,
        active        boolean       NOT NULL DEFAULT true,
        sort_order    int           NOT NULL DEFAULT 0,
        CONSTRAINT uq_avatar_assets_code UNIQUE (code),
        CONSTRAINT chk_avatar_assets_price_nonneg CHECK (price_diamond >= 0)
      )
    `);
    await queryRunner.query(
      `CREATE INDEX idx_avatar_assets_slot_active ON avatar_assets(slot, active)`,
    );

    await queryRunner.query(`
      CREATE TABLE user_avatar_items (
        id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id         uuid        NOT NULL REFERENCES users(id),
        avatar_asset_id uuid        NOT NULL REFERENCES avatar_assets(id),
        acquired_at     timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT uq_user_avatar_items_pair UNIQUE (user_id, avatar_asset_id)
      )
    `);

    await queryRunner.query(`
      CREATE TABLE user_avatar_configs (
        user_id            uuid PRIMARY KEY REFERENCES users(id),
        base_asset_id      uuid NULL REFERENCES avatar_assets(id),
        hair_asset_id      uuid NULL REFERENCES avatar_assets(id),
        face_asset_id      uuid NULL REFERENCES avatar_assets(id),
        outfit_asset_id    uuid NULL REFERENCES avatar_assets(id),
        accessory_asset_id uuid NULL REFERENCES avatar_assets(id),
        updated_at         timestamptz NOT NULL DEFAULT now()
      )
    `);

    // Seed catalog mẫu — mỗi slot có đúng 1 item free (sort_order thấp nhất) làm default
    await queryRunner.query(`
      INSERT INTO avatar_assets (slot, code, name, image_url, z_index, price_diamond, sort_order) VALUES
        ('base',      'base-default',      'Dáng người mặc định', 'https://cdn.litmatch.example/avatar/base-default.png',      10, 0,   1),
        ('hair',      'hair-default',      'Tóc mặc định',        'https://cdn.litmatch.example/avatar/hair-default.png',      20, 0,   1),
        ('hair',      'hair-wavy-gold',    'Tóc lượn sóng vàng',  'https://cdn.litmatch.example/avatar/hair-wavy-gold.png',    20, 50,  2),
        ('face',      'face-default',     'Gương mặt mặc định',  'https://cdn.litmatch.example/avatar/face-default.png',      15, 0,   1),
        ('outfit',    'outfit-default',    'Trang phục mặc định', 'https://cdn.litmatch.example/avatar/outfit-default.png',    30, 0,   1),
        ('outfit',    'outfit-suit',       'Vest dạ hội',         'https://cdn.litmatch.example/avatar/outfit-suit.png',       30, 150, 2),
        ('accessory', 'accessory-none',    'Không phụ kiện',      'https://cdn.litmatch.example/avatar/accessory-none.png',    40, 0,   1),
        ('accessory', 'accessory-crown',   'Vương miện',          'https://cdn.litmatch.example/avatar/accessory-crown.png',   40, 300, 2)
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS user_avatar_configs`);
    await queryRunner.query(`DROP TABLE IF EXISTS user_avatar_items`);
    await queryRunner.query(`DROP TABLE IF EXISTS avatar_assets`);
  }
}
