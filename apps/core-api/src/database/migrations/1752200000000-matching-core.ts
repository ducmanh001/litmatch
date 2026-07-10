import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Giai đoạn 2 (M1) — Matching lõi (docs/03 § 3.8.B, docs/02, docs/07 Giai đoạn 2).
 * `MatchQueue` trong domain model KHÔNG có bảng riêng — queue store là Redis thuần,
 * không giữ business state (business state = match_tickets, nguồn sự thật duy nhất).
 * `(user_id) WHERE status IN ('queued','matched')` unique — "1 user chỉ 1 ticket active"
 * enforce ở DB, không chỉ ở code (cùng triết lý idempotency key ở Economy).
 */
export class MatchingCore1752200000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE match_tickets (
        id                     uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id                uuid         NOT NULL REFERENCES users(id),
        idempotency_key        varchar(255) NOT NULL,
        match_type             varchar(16)  NOT NULL,
        status                 varchar(16)  NOT NULL DEFAULT 'queued',
        region                 varchar(10)  NOT NULL,
        own_gender             varchar(10)  NOT NULL,
        own_age                integer      NOT NULL CHECK (own_age > 0),
        criteria               jsonb        NOT NULL,
        priority               boolean      NOT NULL DEFAULT false,
        speedup_transaction_id uuid         NULL,
        paired_ticket_id       uuid         NULL REFERENCES match_tickets(id),
        match_session_id       uuid         NULL,
        queued_at              timestamptz  NOT NULL DEFAULT now(),
        expires_at             timestamptz  NOT NULL,
        updated_at             timestamptz  NOT NULL DEFAULT now(),
        version                integer      NOT NULL DEFAULT 1
      )
    `);
    await queryRunner.query(
      `CREATE UNIQUE INDEX uq_match_tickets_user_active ON match_tickets(user_id) WHERE status IN ('queued','matched')`,
    );
    await queryRunner.query(`CREATE INDEX idx_match_tickets_status_expires ON match_tickets(status, expires_at)`);
    // Idempotency key unique ở DB (luật 2 CLAUDE.md) — retry cùng key trả lại đúng ticket cũ,
    // không tạo hàng thứ 2 (docs/05 § 5.10).
    await queryRunner.query(
      `CREATE UNIQUE INDEX uq_match_tickets_idempotency_key ON match_tickets(idempotency_key)`,
    );

    await queryRunner.query(`
      CREATE TABLE match_sessions (
        id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        match_type   varchar(16)  NOT NULL,
        user_a_id    uuid         NOT NULL REFERENCES users(id),
        user_b_id    uuid         NOT NULL REFERENCES users(id),
        status       varchar(16)  NOT NULL DEFAULT 'active',
        started_at   timestamptz  NOT NULL DEFAULT now(),
        ended_at     timestamptz  NULL
      )
    `);

    await queryRunner.query(
      `ALTER TABLE match_tickets ADD CONSTRAINT fk_match_tickets_session FOREIGN KEY (match_session_id) REFERENCES match_sessions(id)`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE match_tickets DROP CONSTRAINT IF EXISTS fk_match_tickets_session`);
    await queryRunner.query(`DROP TABLE IF EXISTS match_sessions`);
    await queryRunner.query(`DROP TABLE IF EXISTS match_tickets`);
  }
}
