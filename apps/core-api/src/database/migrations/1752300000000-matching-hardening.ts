import { MigrationInterface, QueryRunner } from 'typeorm';

/** Matching M1 hardening; separate migration because matching-core may already be applied locally. */
export class MatchingHardening1752300000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE match_tickets ADD COLUMN request_hash char(64) NULL`);
    await queryRunner.query(`ALTER TABLE match_tickets ADD COLUMN speedup_applied_at timestamptz NULL`);
    await queryRunner.query(`ALTER TABLE match_tickets ADD COLUMN priority_boost_ms integer NULL`);
    await queryRunner.query(`ALTER TABLE match_tickets ADD COLUMN created_at timestamptz NOT NULL DEFAULT now()`);
    await queryRunner.query(`UPDATE match_tickets SET created_at = queued_at`);
    await queryRunner.query(`
      UPDATE match_tickets
      SET request_hash = encode(
        sha256(convert_to(format(
          '{"matchType":"%s","criteria":{"genderPref":"%s","minAge":%s,"maxAge":%s}}',
          match_type,
          criteria->>'genderPref',
          criteria->>'minAge',
          criteria->>'maxAge'
        ), 'UTF8')),
        'hex'
      )
      WHERE request_hash IS NULL
    `);
    await queryRunner.query(`ALTER TABLE match_tickets ALTER COLUMN request_hash SET NOT NULL`);

    await queryRunner.query(`DROP INDEX IF EXISTS uq_match_tickets_idempotency_key`);
    await queryRunner.query(
      `CREATE UNIQUE INDEX uq_match_tickets_user_idempotency ON match_tickets(user_id, idempotency_key)`,
    );
    await queryRunner.query(`DROP INDEX IF EXISTS uq_match_tickets_user_active`);
    await queryRunner.query(
      `CREATE UNIQUE INDEX uq_match_tickets_user_active ON match_tickets(user_id) WHERE status IN ('queued','matched','confirmed')`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX uq_match_tickets_speedup_transaction ON match_tickets(speedup_transaction_id) WHERE speedup_transaction_id IS NOT NULL`,
    );

    await queryRunner.query(`
      CREATE TABLE matching_operations (
        id                     uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id                uuid         NOT NULL REFERENCES users(id),
        ticket_id              uuid         NOT NULL REFERENCES match_tickets(id),
        kind                   varchar(16)  NOT NULL,
        idempotency_key        varchar(255) NOT NULL,
        request_hash           char(64)     NOT NULL,
        price_diamond          bigint       NOT NULL CHECK (price_diamond > 0),
        priority_boost_ms      integer      NOT NULL CHECK (priority_boost_ms >= 0),
        policy_version         integer      NOT NULL DEFAULT 1 CHECK (policy_version > 0),
        status                 varchar(16)  NOT NULL DEFAULT 'pending',
        economy_transaction_id uuid         NULL,
        applied_at             timestamptz  NULL,
        created_at             timestamptz  NOT NULL DEFAULT now(),
        updated_at             timestamptz  NOT NULL DEFAULT now(),
        CONSTRAINT ck_matching_operations_kind CHECK (kind IN ('speedup')),
        CONSTRAINT ck_matching_operations_status CHECK (status IN ('pending','charged','applied','compensating','compensated')),
        CONSTRAINT uq_matching_operations_user_key UNIQUE (user_id, kind, idempotency_key)
      )
    `);
    await queryRunner.query(
      `CREATE UNIQUE INDEX uq_matching_operations_active_ticket_kind ON matching_operations(ticket_id, kind) WHERE status IN ('pending','charged','applied','compensating')`,
    );
    await queryRunner.query(`CREATE INDEX idx_matching_operations_ticket ON matching_operations(ticket_id)`);
    await queryRunner.query(
      `CREATE INDEX idx_matching_operations_user_created ON matching_operations(user_id, created_at DESC)`,
    );

    await queryRunner.query(`
      CREATE TABLE matching_queue_outbox (
        id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        ticket_id    uuid        NOT NULL REFERENCES match_tickets(id),
        created_at   timestamptz NOT NULL DEFAULT now(),
        processed_at timestamptz NULL,
        attempts     integer     NOT NULL DEFAULT 0 CHECK (attempts >= 0)
      )
    `);
    await queryRunner.query(
      `CREATE INDEX idx_matching_queue_outbox_pending ON matching_queue_outbox(processed_at, created_at)`,
    );
    await queryRunner.query(`CREATE INDEX idx_matching_queue_outbox_ticket ON matching_queue_outbox(ticket_id)`);

    // Existing queued rows may have missed Redis writes before this migration; force a fresh projection.
    await queryRunner.query(
      `INSERT INTO matching_queue_outbox (ticket_id) SELECT id FROM match_tickets WHERE status = 'queued'`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS matching_queue_outbox`);
    await queryRunner.query(`DROP TABLE IF EXISTS matching_operations`);
    await queryRunner.query(`DROP INDEX IF EXISTS uq_match_tickets_speedup_transaction`);
    await queryRunner.query(`DROP INDEX IF EXISTS uq_match_tickets_user_active`);
    await queryRunner.query(
      `CREATE UNIQUE INDEX uq_match_tickets_user_active ON match_tickets(user_id) WHERE status IN ('queued','matched')`,
    );
    // A scoped key may legitimately collide across users. Only restore the legacy global index when safe;
    // otherwise keep the scoped invariant so rollback never destroys or rejects valid rows.
    await queryRunner.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM match_tickets GROUP BY idempotency_key HAVING count(*) > 1
        ) THEN
          DROP INDEX IF EXISTS uq_match_tickets_user_idempotency;
          CREATE UNIQUE INDEX uq_match_tickets_idempotency_key ON match_tickets(idempotency_key);
        END IF;
      END $$
    `);
    await queryRunner.query(`ALTER TABLE match_tickets DROP COLUMN IF EXISTS created_at`);
    await queryRunner.query(`ALTER TABLE match_tickets DROP COLUMN IF EXISTS speedup_applied_at`);
    await queryRunner.query(`ALTER TABLE match_tickets DROP COLUMN IF EXISTS priority_boost_ms`);
    await queryRunner.query(`ALTER TABLE match_tickets DROP COLUMN IF EXISTS request_hash`);
  }
}
