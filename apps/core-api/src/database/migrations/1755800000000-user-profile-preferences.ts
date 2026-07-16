import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Trường hồ sơ theo edit-profile.html: sở thích (tag) + "Đang tìm kiếm" (giới tính quan tâm,
 * khoảng tuổi). Toàn bộ nullable — user cũ chưa khai gì, không cần backfill.
 */
export class UserProfilePreferences1755800000000 implements MigrationInterface {
  name = 'UserProfilePreferences1755800000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE users
      ADD COLUMN interests jsonb,
      ADD COLUMN seeking_gender varchar(8),
      ADD COLUMN seeking_age_min int,
      ADD COLUMN seeking_age_max int
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE users
      DROP COLUMN IF EXISTS interests,
      DROP COLUMN IF EXISTS seeking_gender,
      DROP COLUMN IF EXISTS seeking_age_min,
      DROP COLUMN IF EXISTS seeking_age_max
    `);
  }
}
