import { MigrationInterface, QueryRunner } from 'typeorm';

/** Đổi seed URL CDN placeholder sang asset SVG được deploy cùng web. */
export class AvatarPublicAssets1757300000000 implements MigrationInterface {
  private readonly assets = [
    ['base-default', '/avatar/base-default.svg'],
    ['hair-default', '/avatar/hair-default.svg'],
    ['hair-wavy-gold', '/avatar/hair-wavy-gold.svg'],
    ['face-default', '/avatar/face-default.svg'],
    ['outfit-default', '/avatar/outfit-default.svg'],
    ['outfit-suit', '/avatar/outfit-suit.svg'],
    ['accessory-none', '/avatar/accessory-none.svg'],
    ['accessory-crown', '/avatar/accessory-crown.svg'],
  ] as const;

  public async up(queryRunner: QueryRunner): Promise<void> {
    for (const [code, imageUrl] of this.assets) {
      await queryRunner.query(
        `UPDATE avatar_assets
            SET image_url = $1
          WHERE code = $2
            AND image_url LIKE 'https://cdn.litmatch.example/%'`,
        [imageUrl, code],
      );
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    for (const [code, imageUrl] of this.assets) {
      await queryRunner.query(
        `UPDATE avatar_assets
            SET image_url = 'https://cdn.litmatch.example/avatar/' || code || '.png'
          WHERE code = $1
            AND image_url = $2`,
        [code, imageUrl],
      );
    }
  }
}
