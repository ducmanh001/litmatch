import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Stories P4 (docs/services/feed-service.md § 8, mở rộng module `feed`, W3). Entity riêng —
 * KHÁC `posts` (ephemeral, hard-delete khi hết hạn, không audit trail). `expires_at` snapshot
 * NGAY LÚC TẠO (STORY_TTL_HOURS) — hết hạn = filter lúc đọc là nguồn sự thật; sweeper
 * (`story-sweeper.job.ts`, pattern party-room) chỉ dọn rác định kỳ, không phải chốt correctness.
 */
export class Story1754500000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE stories (
        id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        author_user_id  uuid          NOT NULL REFERENCES users(id),
        media_url       varchar(2048) NOT NULL,
        caption         text          NULL,
        audience        varchar(16)   NOT NULL DEFAULT 'friends',
        expires_at      timestamptz   NOT NULL,
        idempotency_key varchar(255)  NOT NULL,
        created_at      timestamptz   NOT NULL DEFAULT now(),
        CONSTRAINT uq_stories_idempotency_key UNIQUE (idempotency_key),
        CONSTRAINT chk_stories_audience CHECK (audience IN ('public', 'friends'))
      )
    `);
    // Ring: 1 tác giả có nhiều story còn hạn — lấy theo (author, expires_at) lúc đọc
    await queryRunner.query(
      `CREATE INDEX idx_stories_author_expires ON stories (author_user_id, expires_at)`,
    );
    // Sweeper quét story hết hạn theo lô
    await queryRunner.query(
      `CREATE INDEX idx_stories_expires_at ON stories (expires_at)`,
    );

    await queryRunner.query(`
      CREATE TABLE story_views (
        id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        story_id   uuid        NOT NULL REFERENCES stories(id) ON DELETE CASCADE,
        viewer_id  uuid        NOT NULL REFERENCES users(id),
        created_at timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT uq_story_views_story_viewer UNIQUE (story_id, viewer_id)
      )
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS story_views`);
    await queryRunner.query(`DROP TABLE IF EXISTS stories`);
  }
}
