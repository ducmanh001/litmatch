import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Index cho danh sách "đang theo dõi" (`GET /profiles/:id/following`): lọc theo follower rồi sắp
 * theo `last_followed_at`. Danh sách follower đã có `idx_profile_follows_followee_daily`.
 */
export class ProfileFollowFollowingIndex1757900000000 implements MigrationInterface {
  name = 'ProfileFollowFollowingIndex1757900000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_profile_follows_follower_recent
      ON profile_follows(follower_user_id, active, last_followed_at)
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      'DROP INDEX IF EXISTS idx_profile_follows_follower_recent',
    );
  }
}
