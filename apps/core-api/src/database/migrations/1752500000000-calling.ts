import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Giai đoạn 2 — Calling module (docs/services/calling-service.md).
 * Chốt chặn ở tầng DB:
 * - uq_call_sessions_match_session: 1 voice MatchSession = tối đa 1 call — 2 bên join
 *   đồng thời chỉ 1 dòng được tạo, bên thua lấy lại dòng đó.
 * - CHECK status/end_reason: enum enforce ở DB; transition enforce ở service (ended terminal).
 * - idx status+created: ticker quét pending quá hạn + active theo status.
 * Billing KHÔNG có bảng riêng — mỗi phút là 1 Transaction economy với idempotency key
 * `calling:tick:{callId}:{userId}:{minute}` (unique sẵn ở transactions).
 */
export class Calling1752500000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE call_sessions (
        id               uuid PRIMARY KEY,
        match_session_id uuid        NOT NULL REFERENCES match_sessions(id),
        room_name        varchar(64) NOT NULL,
        user_a_id        uuid        NOT NULL REFERENCES users(id),
        user_b_id        uuid        NOT NULL REFERENCES users(id),
        status           varchar(16) NOT NULL DEFAULT 'pending'
                         CHECK (status IN ('pending','active','ended')),
        joined_a_at      timestamptz NULL,
        joined_b_at      timestamptz NULL,
        started_at       timestamptz NULL,
        ended_at         timestamptz NULL,
        end_reason       varchar(24) NULL
                         CHECK (end_reason IN ('completed','free_limit','insufficient_balance','pending_timeout')),
        duration_seconds integer     NULL CHECK (duration_seconds >= 0),
        billed_minutes   integer     NOT NULL DEFAULT 0 CHECK (billed_minutes >= 0),
        created_at       timestamptz NOT NULL DEFAULT now(),
        updated_at       timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT uq_call_sessions_match_session UNIQUE (match_session_id),
        CONSTRAINT uq_call_sessions_room_name UNIQUE (room_name)
      )
    `);
    await queryRunner.query(
      `CREATE INDEX idx_call_sessions_status_created ON call_sessions(status, created_at)`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS call_sessions`);
  }
}
