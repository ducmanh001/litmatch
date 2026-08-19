import { MigrationInterface, QueryRunner } from 'typeorm';

/** Profile follow state + daily interest index. */
export class ProfileFollow1757400000000 implements MigrationInterface {
  name = 'ProfileFollow1757400000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE profile_follows (
        id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        follower_user_id  uuid        NOT NULL REFERENCES users(id),
        followee_user_id  uuid        NOT NULL REFERENCES users(id),
        active            boolean     NOT NULL DEFAULT true,
        last_followed_at  timestamptz NOT NULL DEFAULT now(),
        created_at        timestamptz NOT NULL DEFAULT now(),
        updated_at        timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT uq_profile_follows_pair UNIQUE (follower_user_id, followee_user_id),
        CONSTRAINT chk_profile_follows_not_self CHECK (follower_user_id <> followee_user_id)
      )
    `);
    await queryRunner.query(`
      CREATE INDEX idx_profile_follows_followee_daily
      ON profile_follows(followee_user_id, active, last_followed_at)
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS profile_follows`);
  }
}
