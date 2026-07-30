import { MigrationInterface, QueryRunner } from 'typeorm';

/** Guest match quota theo ngày UTC và identity HMAC; không lưu device/IP/fingerprint thô. */
export class GuestMatchQuota1756400000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE guest_match_quotas (
        quota_date date NOT NULL,
        key_hash char(64) NOT NULL,
        count integer NOT NULL DEFAULT 0 CHECK (count >= 0),
        updated_at timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT pk_guest_match_quotas PRIMARY KEY (quota_date, key_hash)
      )
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS guest_match_quotas`);
  }
}
