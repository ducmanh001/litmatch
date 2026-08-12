import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Metadata cho ảnh upload trực tiếp lên object storage.
 * Nội dung binary không đi qua core-api; bảng này chỉ bind asset với owner và intent sử dụng.
 */
export class ImageAssets1756900000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE image_assets (
        id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        owner_user_id  uuid         NOT NULL REFERENCES users(id),
        storage_key    varchar(1024) NOT NULL UNIQUE,
        purpose        varchar(16)   NOT NULL,
        content_type   varchar(64)   NOT NULL,
        size_bytes     int          NOT NULL,
        status         varchar(16)   NOT NULL DEFAULT 'pending',
        created_at     timestamptz  NOT NULL DEFAULT now(),
        updated_at     timestamptz  NOT NULL DEFAULT now(),
        CONSTRAINT chk_image_assets_purpose CHECK (purpose IN ('post', 'message', 'story')),
        CONSTRAINT chk_image_assets_content_type CHECK (content_type IN ('image/jpeg', 'image/png', 'image/webp', 'image/gif')),
        CONSTRAINT chk_image_assets_size CHECK (size_bytes > 0),
        CONSTRAINT chk_image_assets_status CHECK (status IN ('pending', 'ready'))
      )
    `);
    await queryRunner.query(
      `CREATE INDEX idx_image_assets_owner_created ON image_assets(owner_user_id, created_at DESC)`,
    );
    await queryRunner.query(
      `CREATE INDEX idx_image_assets_owner_status ON image_assets(owner_user_id, status)`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS image_assets`);
  }
}
