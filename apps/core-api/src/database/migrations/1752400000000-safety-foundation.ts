import { MigrationInterface, QueryRunner } from 'typeorm';

/** R-007 foundation only: directed Block, Report metadata, idempotency and append-only audit. */
export class SafetyFoundation1752400000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE user_blocks (
        id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        blocker_user_id uuid        NOT NULL REFERENCES users(id),
        blocked_user_id uuid        NOT NULL REFERENCES users(id),
        status          varchar(16) NOT NULL DEFAULT 'active',
        blocked_at      timestamptz NOT NULL DEFAULT now(),
        unblocked_at    timestamptz NULL,
        created_at      timestamptz NOT NULL DEFAULT now(),
        updated_at      timestamptz NOT NULL DEFAULT now(),
        version         integer     NOT NULL DEFAULT 1,
        CONSTRAINT uq_user_blocks_direction UNIQUE (blocker_user_id, blocked_user_id),
        CONSTRAINT ck_user_blocks_not_self CHECK (blocker_user_id <> blocked_user_id),
        CONSTRAINT ck_user_blocks_status CHECK (status IN ('active', 'unblocked')),
        CONSTRAINT ck_user_blocks_state_time CHECK (
          (status = 'active' AND unblocked_at IS NULL) OR
          (status = 'unblocked' AND unblocked_at IS NOT NULL AND unblocked_at >= blocked_at)
        )
      )
    `);
    await queryRunner.query(
      `CREATE INDEX idx_user_blocks_blocker_status ON user_blocks(blocker_user_id, status)`,
    );
    await queryRunner.query(
      `CREATE INDEX idx_user_blocks_blocked_status ON user_blocks(blocked_user_id, status)`,
    );

    await queryRunner.query(`
      CREATE TABLE safety_reports (
        id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        reporter_user_id uuid        NOT NULL REFERENCES users(id),
        reported_user_id uuid        NOT NULL REFERENCES users(id),
        category         varchar(32) NOT NULL,
        priority         varchar(16) NOT NULL,
        status           varchar(16) NOT NULL DEFAULT 'submitted',
        summary          varchar(500) NULL,
        created_at       timestamptz NOT NULL DEFAULT now(),
        updated_at       timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT ck_safety_reports_not_self CHECK (reporter_user_id <> reported_user_id),
        CONSTRAINT ck_safety_reports_category CHECK (
          category IN ('harassment', 'hate_or_abuse', 'sexual_content', 'spam_or_scam',
                       'threat_or_violence', 'suspected_minor', 'other')
        ),
        CONSTRAINT ck_safety_reports_priority CHECK (priority IN ('standard', 'urgent')),
        CONSTRAINT ck_safety_reports_status CHECK (status IN ('submitted'))
      )
    `);
    await queryRunner.query(
      `CREATE INDEX idx_safety_reports_reporter_created ON safety_reports(reporter_user_id, created_at DESC)`,
    );
    await queryRunner.query(
      `CREATE INDEX idx_safety_reports_reported_created ON safety_reports(reported_user_id, created_at DESC)`,
    );

    // Normalized fixed-width metadata prevents this table from becoming an unsafe raw-blob/URL store.
    await queryRunner.query(`
      CREATE TABLE report_evidence_metadata (
        id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        report_id    uuid        NOT NULL REFERENCES safety_reports(id) ON DELETE CASCADE,
        kind         varchar(24) NOT NULL,
        reference_id uuid        NOT NULL,
        sha256       char(64)    NULL,
        content_type varchar(32) NULL,
        byte_size    integer     NULL,
        verification_status varchar(16) NOT NULL DEFAULT 'unverified',
        created_at   timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT ck_report_evidence_kind CHECK (kind IN ('match_session', 'message', 'profile', 'media')),
        CONSTRAINT ck_report_evidence_sha256 CHECK (sha256 IS NULL OR sha256 ~ '^[a-f0-9]{64}$'),
        CONSTRAINT ck_report_evidence_content_type CHECK (
          content_type IS NULL OR content_type IN
            ('image/jpeg', 'image/png', 'image/webp', 'audio/mpeg', 'audio/mp4', 'video/mp4')
        ),
        CONSTRAINT ck_report_evidence_byte_size CHECK (byte_size IS NULL OR byte_size BETWEEN 1 AND 52428800),
        CONSTRAINT ck_report_evidence_verification CHECK (verification_status IN ('unverified')),
        CONSTRAINT uq_report_evidence_reference UNIQUE (report_id, kind, reference_id)
      )
    `);
    await queryRunner.query(`CREATE INDEX idx_report_evidence_report ON report_evidence_metadata(report_id)`);

    await queryRunner.query(`
      CREATE TABLE safety_operations (
        id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        actor_user_id   uuid         NOT NULL REFERENCES users(id),
        kind            varchar(16)  NOT NULL,
        idempotency_key varchar(255) NOT NULL,
        request_hash    char(64)     NOT NULL,
        resource_id     uuid         NOT NULL,
        created_at      timestamptz  NOT NULL DEFAULT now(),
        CONSTRAINT ck_safety_operations_kind CHECK (kind IN ('block', 'unblock', 'report')),
        CONSTRAINT ck_safety_operations_hash CHECK (request_hash ~ '^[a-f0-9]{64}$'),
        CONSTRAINT uq_safety_operations_actor_kind_key UNIQUE (actor_user_id, kind, idempotency_key)
      )
    `);

    await queryRunner.query(`
      CREATE TABLE safety_audit_events (
        id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        actor_user_id   uuid        NOT NULL REFERENCES users(id),
        subject_user_id uuid        NOT NULL REFERENCES users(id),
        action          varchar(32) NOT NULL,
        resource_type   varchar(16) NOT NULL,
        resource_id     uuid        NOT NULL,
        metadata        jsonb       NOT NULL DEFAULT '{}'::jsonb,
        created_at      timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT ck_safety_audit_action CHECK (
          action IN ('block.activated', 'block.removed', 'report.submitted')
        ),
        CONSTRAINT ck_safety_audit_resource_type CHECK (resource_type IN ('block', 'report')),
        CONSTRAINT ck_safety_audit_metadata CHECK (jsonb_typeof(metadata) = 'object')
      )
    `);
    await queryRunner.query(
      `CREATE INDEX idx_safety_audit_actor_created ON safety_audit_events(actor_user_id, created_at DESC)`,
    );
    await queryRunner.query(
      `CREATE INDEX idx_safety_audit_subject_created ON safety_audit_events(subject_user_id, created_at DESC)`,
    );

    await queryRunner.query(`
      CREATE FUNCTION reject_safety_append_only_mutation() RETURNS trigger AS $$
      BEGIN
        RAISE EXCEPTION '% is append-only', TG_TABLE_NAME USING ERRCODE = '55000';
      END;
      $$ LANGUAGE plpgsql
    `);
    await queryRunner.query(`
      CREATE TRIGGER trg_safety_audit_events_append_only
      BEFORE UPDATE OR DELETE ON safety_audit_events
      FOR EACH ROW EXECUTE FUNCTION reject_safety_append_only_mutation()
    `);
    await queryRunner.query(`
      CREATE TRIGGER trg_safety_operations_append_only
      BEFORE UPDATE OR DELETE ON safety_operations
      FOR EACH ROW EXECUTE FUNCTION reject_safety_append_only_mutation()
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TRIGGER IF EXISTS trg_safety_operations_append_only ON safety_operations`);
    await queryRunner.query(`DROP TRIGGER IF EXISTS trg_safety_audit_events_append_only ON safety_audit_events`);
    await queryRunner.query(`DROP FUNCTION IF EXISTS reject_safety_append_only_mutation`);
    await queryRunner.query(`DROP TABLE IF EXISTS safety_audit_events`);
    await queryRunner.query(`DROP TABLE IF EXISTS safety_operations`);
    await queryRunner.query(`DROP TABLE IF EXISTS report_evidence_metadata`);
    await queryRunner.query(`DROP TABLE IF EXISTS safety_reports`);
    await queryRunner.query(`DROP TABLE IF EXISTS user_blocks`);
  }
}
