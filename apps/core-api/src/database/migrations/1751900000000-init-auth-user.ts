import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Giai đoạn 0: bảng cho Auth + User.
 * Kiểm tra chéo docs/10 § 10.2:
 * - unique (provider, provider_uid): 2 request đăng ký song song cùng deviceId/phone không tạo được 2 account
 * - refresh_tokens.token_hash unique + rotated_at: phát hiện token reuse ở tầng DB
 * - phone_otps: attempt_count enforce ở server, không tin client
 */
export class InitAuthUser1751900000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE users (
        id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        nickname      varchar(50)  NOT NULL,
        gender        varchar(10)  NOT NULL DEFAULT 'unknown',
        birth_date    date         NULL,
        region        varchar(10)  NULL,
        avatar_id     varchar(64)  NOT NULL,
        trust_score   integer      NOT NULL DEFAULT 100,
        status        varchar(16)  NOT NULL DEFAULT 'active',
        is_guest      boolean      NOT NULL DEFAULT false,
        created_at    timestamptz  NOT NULL DEFAULT now(),
        updated_at    timestamptz  NOT NULL DEFAULT now()
      )
    `);

    await queryRunner.query(`
      CREATE TABLE auth_identities (
        id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id       uuid         NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        provider      varchar(16)  NOT NULL,
        provider_uid  varchar(255) NOT NULL,
        created_at    timestamptz  NOT NULL DEFAULT now(),
        CONSTRAINT uq_auth_identities_provider_uid UNIQUE (provider, provider_uid)
      )
    `);
    await queryRunner.query(`CREATE INDEX idx_auth_identities_user_id ON auth_identities(user_id)`);

    await queryRunner.query(`
      CREATE TABLE refresh_tokens (
        id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id       uuid         NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        token_hash    char(64)     NOT NULL,
        family_id     uuid         NOT NULL,
        expires_at    timestamptz  NOT NULL,
        revoked_at    timestamptz  NULL,
        rotated_at    timestamptz  NULL,
        created_at    timestamptz  NOT NULL DEFAULT now(),
        CONSTRAINT uq_refresh_tokens_token_hash UNIQUE (token_hash)
      )
    `);
    await queryRunner.query(`CREATE INDEX idx_refresh_tokens_user_id ON refresh_tokens(user_id)`);
    await queryRunner.query(`CREATE INDEX idx_refresh_tokens_family_id ON refresh_tokens(family_id)`);

    await queryRunner.query(`
      CREATE TABLE phone_otps (
        id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        phone         varchar(20)  NOT NULL,
        code_hash     char(64)     NOT NULL,
        expires_at    timestamptz  NOT NULL,
        attempt_count integer      NOT NULL DEFAULT 0,
        consumed_at   timestamptz  NULL,
        created_at    timestamptz  NOT NULL DEFAULT now()
      )
    `);
    await queryRunner.query(`CREATE INDEX idx_phone_otps_phone_created ON phone_otps(phone, created_at DESC)`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS phone_otps`);
    await queryRunner.query(`DROP TABLE IF EXISTS refresh_tokens`);
    await queryRunner.query(`DROP TABLE IF EXISTS auth_identities`);
    await queryRunner.query(`DROP TABLE IF EXISTS users`);
  }
}
