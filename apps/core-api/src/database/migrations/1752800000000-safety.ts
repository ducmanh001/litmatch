import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Giai đoạn 4 — Safety (docs/services/safety-service.md).
 * - `reports`/`blocks` append-only (docs/06: hành động nhạy cảm phải log audit, không xoá được).
 * - `chk_reports_no_self_report` / `chk_blocks_no_self_block`: chặn tự report/block chính mình
 *   thêm 1 lớp ở tầng DB (service đã chặn, đây là backstop).
 * - `match_tickets.trust_penalty_ms`: snapshot 1 lần lúc enqueue, cộng vào công thức score có
 *   sẵn (docs/services/safety-service.md § 3.2) — không đổi state machine/lock của Matching.
 */
export class Safety1752800000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE reports (
        id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        reporter_user_id      uuid        NOT NULL REFERENCES users(id),
        target_user_id        uuid        NOT NULL REFERENCES users(id),
        reason                varchar(32) NOT NULL,
        description           text        NULL,
        trust_penalty_applied int         NOT NULL DEFAULT 0,
        created_at            timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT chk_reports_no_self_report CHECK (reporter_user_id <> target_user_id)
      )
    `);
    // Rate-limit per-pair cooldown (§ 4) — tìm report hiệu lực gần nhất của đúng cặp
    await queryRunner.query(
      `CREATE INDEX idx_reports_reporter_target_created ON reports(reporter_user_id, target_user_id, created_at)`,
    );
    // canPair (§ 3.1) + daily cap (§ 4) — tìm report liên quan target trong window
    await queryRunner.query(
      `CREATE INDEX idx_reports_target_created ON reports(target_user_id, created_at)`,
    );

    await queryRunner.query(`
      CREATE TABLE blocks (
        id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        blocker_user_id   uuid        NOT NULL REFERENCES users(id),
        blocked_user_id   uuid        NOT NULL REFERENCES users(id),
        action            varchar(16) NOT NULL,
        created_at        timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT chk_blocks_no_self_block CHECK (blocker_user_id <> blocked_user_id)
      )
    `);
    // Trạng thái hiện tại = dòng mới nhất theo cặp (§ 1) + canPair (§ 3.1)
    await queryRunner.query(
      `CREATE INDEX idx_blocks_pair_created ON blocks(blocker_user_id, blocked_user_id, created_at DESC)`,
    );

    await queryRunner.query(
      `ALTER TABLE match_tickets ADD COLUMN trust_penalty_ms int NOT NULL DEFAULT 0`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE match_tickets DROP COLUMN trust_penalty_ms`,
    );
    await queryRunner.query(`DROP TABLE IF EXISTS blocks`);
    await queryRunner.query(`DROP TABLE IF EXISTS reports`);
  }
}
