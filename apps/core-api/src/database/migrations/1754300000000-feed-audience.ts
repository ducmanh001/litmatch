import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Feed P1 — audience per-post (docs/services/feed-service.md § 7, docs/plans/
 * 2026-07-14-plan-6-tinh-nang-social-discovery.md § 3.3). `audience` mặc định `public` (không
 * đổi hành vi bài cũ — feed toàn cục vẫn thấy như trước). `idempotency_key` cho createPost
 * (unique — client retry mất mạng không tạo đôi bài).
 */
export class FeedAudience1754300000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE posts
        ADD COLUMN audience varchar(16) NOT NULL DEFAULT 'public',
        ADD COLUMN idempotency_key varchar(255) NULL
    `);
    await queryRunner.query(`
      ALTER TABLE posts ADD CONSTRAINT chk_posts_audience
        CHECK (audience IN ('public', 'friends', 'only_me'))
    `);
    await queryRunner.query(`
      CREATE UNIQUE INDEX uq_posts_idempotency_key ON posts (idempotency_key)
      WHERE idempotency_key IS NOT NULL
    `);
    // Profile timeline: query theo (author_user_id, audience, seq) — bổ sung index riêng cho
    // pattern truy vấn mới, không đổi idx_posts_seq của feed toàn cục
    await queryRunner.query(`
      CREATE INDEX idx_posts_author_audience_seq ON posts (author_user_id, audience, seq)
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP INDEX IF EXISTS idx_posts_author_audience_seq`,
    );
    await queryRunner.query(`DROP INDEX IF EXISTS uq_posts_idempotency_key`);
    await queryRunner.query(
      `ALTER TABLE posts DROP CONSTRAINT IF EXISTS chk_posts_audience`,
    );
    await queryRunner.query(`
      ALTER TABLE posts
        DROP COLUMN IF EXISTS audience,
        DROP COLUMN IF EXISTS idempotency_key
    `);
  }
}
