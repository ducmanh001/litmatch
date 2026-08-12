import { MigrationInterface, QueryRunner } from 'typeorm';

/** Daily free match quotas + paid-match marker on queue tickets. */
export class MatchingDailyEntitlements1757100000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE match_daily_quotas (
        user_id    uuid NOT NULL REFERENCES users(id),
        quota_date date NOT NULL,
        match_type varchar(8) NOT NULL CHECK (match_type IN ('soul', 'voice')),
        count      integer NOT NULL DEFAULT 0 CHECK (count >= 0),
        updated_at timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT pk_match_daily_quotas PRIMARY KEY (user_id, quota_date, match_type)
      )
    `);
    await queryRunner.query(
      `ALTER TABLE match_tickets ADD COLUMN paid_diamond boolean NOT NULL DEFAULT false`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE match_tickets DROP COLUMN IF EXISTS paid_diamond`,
    );
    await queryRunner.query(`DROP TABLE IF EXISTS match_daily_quotas`);
  }
}
