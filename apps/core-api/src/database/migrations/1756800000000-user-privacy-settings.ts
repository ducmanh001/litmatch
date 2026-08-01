import { MigrationInterface, QueryRunner } from 'typeorm';

/** Privacy controls are persisted separately so public profile data stays minimal. */
export class UserPrivacySettings1756800000000 implements MigrationInterface {
  name = 'UserPrivacySettings1756800000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE user_privacy_settings (
        user_id uuid PRIMARY KEY REFERENCES users(id),
        show_online_status boolean NOT NULL DEFAULT true,
        show_distance boolean NOT NULL DEFAULT true,
        searchable_by_phone boolean NOT NULL DEFAULT false,
        hide_profile boolean NOT NULL DEFAULT false
      )
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('DROP TABLE IF EXISTS user_privacy_settings');
  }
}
