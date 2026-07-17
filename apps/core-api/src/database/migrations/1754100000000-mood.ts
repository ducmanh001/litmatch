import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Mood status — module mới `mood`, preset-only W1
 * (docs/plans/2026-07-14-plan-6-tinh-nang-social-discovery.md § 3.5).
 * - `mood_presets`: catalog data-driven (pattern `avatar_assets`), seed dưới đây.
 * - `mood_status_events`: APPEND-ONLY — set/clear = 1 dòng mới, không update/xoá. "Mood hiện
 *   tại" = dòng mới nhất của user, derive khi đọc (kind='clear' hoặc expires_at <= now → không
 *   có mood). `preset_id` NULL khi kind='clear'. Không có cột `status` (approve/pending) vì W1
 *   chỉ preset (auto-approve) — thêm cột đó bằng migration mới khi ship free-text (backlog).
 */
export class Mood1754100000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE mood_presets (
        id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        code       varchar(64)  NOT NULL,
        label      varchar(128) NOT NULL,
        emoji      varchar(8)   NOT NULL,
        active     boolean      NOT NULL DEFAULT true,
        sort_order int          NOT NULL DEFAULT 0,
        CONSTRAINT uq_mood_presets_code UNIQUE (code)
      )
    `);

    await queryRunner.query(`
      CREATE TABLE mood_status_events (
        id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id         uuid        NOT NULL REFERENCES users(id),
        preset_id       uuid        NULL REFERENCES mood_presets(id),
        kind            varchar(8)  NOT NULL,
        expires_at      timestamptz NULL,
        idempotency_key varchar(128) NOT NULL,
        created_at      timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT uq_mood_status_events_idempotency_key UNIQUE (idempotency_key),
        CONSTRAINT chk_mood_status_events_kind CHECK (kind IN ('set', 'clear')),
        CONSTRAINT chk_mood_status_events_set_has_preset
          CHECK ((kind = 'set' AND preset_id IS NOT NULL AND expires_at IS NOT NULL)
              OR (kind = 'clear' AND preset_id IS NULL AND expires_at IS NULL))
      )
    `);
    // "Mood hiện tại" = dòng mới nhất/user — cùng pattern keyset (user_id, created_at DESC)
    await queryRunner.query(
      `CREATE INDEX idx_mood_status_events_user_created ON mood_status_events (user_id, created_at DESC)`,
    );

    // Seed catalog mẫu — đủ đa dạng để test/dev, danh sách thật chỉnh qua admin sau
    await queryRunner.query(`
      INSERT INTO mood_presets (code, label, emoji, sort_order) VALUES
        ('happy',    'Đang vui',        '😄', 1),
        ('chill',    'Đang thư giãn',   '😌', 2),
        ('bored',    'Đang rảnh, chat đi', '🥱', 3),
        ('curious',  'Tò mò làm quen',  '🤔', 4),
        ('hungry',   'Đói bụng',        '🍜', 5),
        ('sleepy',   'Buồn ngủ',        '😴', 6)
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS mood_status_events`);
    await queryRunner.query(`DROP TABLE IF EXISTS mood_presets`);
  }
}
