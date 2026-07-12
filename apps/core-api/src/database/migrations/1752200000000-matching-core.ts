import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Giai đoạn 2 slice M1 — Matching ticket/queue engine (docs/services/matching-service.md § 5).
 * Chốt chặn ở tầng DB, không chỉ ở code:
 * - uq_match_tickets_active_user: partial unique — 1 user chỉ 1 ticket queued/matched (docs/06).
 *   (TypeORM không khai báo được partial index qua decorator → raw SQL ở đây.)
 * - uq_match_tickets_idempotency_key: retry POST /matching/tickets cùng key không tạo ticket đôi
 *   (docs/05 § 5.10 — idempotency key là unique constraint DB).
 * - CHECK status/match_type: enum enforce ở DB, transition thì enforce ở service (state machine § 1).
 * - idx_match_tickets_status_shard + idx_match_tickets_status_enqueued: sweeper/matcher quét theo status.
 */
export class MatchingCore1752200000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE match_tickets (
        id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id           uuid         NOT NULL REFERENCES users(id),
        match_type        varchar(8)   NOT NULL CHECK (match_type IN ('soul','voice')),
        region            varchar(16)  NOT NULL,
        age_band          integer      NOT NULL,
        status            varchar(16)  NOT NULL DEFAULT 'queued'
                          CHECK (status IN ('queued','matched','confirmed','expired','cancelled')),
        enqueued_at       timestamptz  NOT NULL,
        priority_boost_ms integer      NOT NULL DEFAULT 0 CHECK (priority_boost_ms >= 0),
        session_id        uuid         NULL,
        idempotency_key   varchar(255) NOT NULL,
        created_at        timestamptz  NOT NULL DEFAULT now(),
        updated_at        timestamptz  NOT NULL DEFAULT now(),
        CONSTRAINT uq_match_tickets_idempotency_key UNIQUE (idempotency_key)
      )
    `);
    // 1 user chỉ 1 ticket active (queued/matched) — chặn ở DB, không chỉ ở code (docs/06, spec § 5)
    await queryRunner.query(`
      CREATE UNIQUE INDEX uq_match_tickets_active_user
        ON match_tickets(user_id)
        WHERE status IN ('queued','matched')
    `);
    await queryRunner.query(
      `CREATE INDEX idx_match_tickets_status_shard ON match_tickets(status, match_type, region, age_band)`,
    );
    // sweeper quét queued quá hạn theo enqueued_at
    await queryRunner.query(`CREATE INDEX idx_match_tickets_status_enqueued ON match_tickets(status, enqueued_at)`);
    await queryRunner.query(`CREATE INDEX idx_match_tickets_user ON match_tickets(user_id)`);

    await queryRunner.query(`
      CREATE TABLE match_sessions (
        id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        match_type      varchar(8)  NOT NULL CHECK (match_type IN ('soul','voice')),
        user_a_id       uuid        NOT NULL REFERENCES users(id),
        user_b_id       uuid        NOT NULL REFERENCES users(id),
        ticket_a_id     uuid        NOT NULL REFERENCES match_tickets(id),
        ticket_b_id     uuid        NOT NULL REFERENCES match_tickets(id),
        status          varchar(16) NOT NULL DEFAULT 'pending_confirm'
                        CHECK (status IN ('pending_confirm','confirmed','expired')),
        confirmed_a_at  timestamptz NULL,
        confirmed_b_at  timestamptz NULL,
        ended_at        timestamptz NULL,
        created_at      timestamptz NOT NULL DEFAULT now(),
        updated_at      timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT chk_match_sessions_distinct_users CHECK (user_a_id <> user_b_id)
      )
    `);
    // sweeper quét pending_confirm quá hạn theo created_at
    await queryRunner.query(`CREATE INDEX idx_match_sessions_status_created ON match_sessions(status, created_at)`);

    // FK ticket → session thêm sau khi cả 2 bảng tồn tại (tham chiếu vòng)
    await queryRunner.query(`
      ALTER TABLE match_tickets
        ADD CONSTRAINT fk_match_tickets_session FOREIGN KEY (session_id) REFERENCES match_sessions(id)
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE match_tickets DROP CONSTRAINT IF EXISTS fk_match_tickets_session`);
    await queryRunner.query(`DROP TABLE IF EXISTS match_sessions`);
    await queryRunner.query(`DROP TABLE IF EXISTS match_tickets`);
  }
}
