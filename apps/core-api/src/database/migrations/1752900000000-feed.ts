import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Giai đoạn 4 — Feed (docs/services/feed-service.md).
 * - `posts`/`comments`: soft-delete qua `deleted_at`, không hard-delete (giữ tham chiếu + audit).
 * - `chk_posts_content_or_image`: bắt buộc có content hoặc imageUrl.
 * - `uq_reactions_post_user`: 1 user chỉ 1 reaction/bài — chặn double-like race ở tầng DB.
 * - `seq` bigserial trên `posts`/`comments` làm cursor keyset (không dùng created_at).
 */
export class Feed1752900000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE posts (
        id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        seq            bigserial   NOT NULL,
        author_user_id uuid        NOT NULL REFERENCES users(id),
        content        text        NULL,
        image_url      varchar(2048) NULL,
        like_count     int         NOT NULL DEFAULT 0,
        comment_count  int         NOT NULL DEFAULT 0,
        deleted_at     timestamptz NULL,
        created_at     timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT chk_posts_content_or_image CHECK (content IS NOT NULL OR image_url IS NOT NULL)
      )
    `);
    // Feed công khai toàn cục, cursor keyset theo seq giảm dần (feed-service.md § 1)
    await queryRunner.query(`CREATE INDEX idx_posts_seq ON posts(seq)`);

    await queryRunner.query(`
      CREATE TABLE comments (
        id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        seq            bigserial   NOT NULL,
        post_id        uuid        NOT NULL REFERENCES posts(id),
        author_user_id uuid        NOT NULL REFERENCES users(id),
        content        text        NOT NULL,
        deleted_at     timestamptz NULL,
        created_at     timestamptz NOT NULL DEFAULT now()
      )
    `);
    await queryRunner.query(
      `CREATE INDEX idx_comments_post_seq ON comments(post_id, seq)`,
    );

    await queryRunner.query(`
      CREATE TABLE reactions (
        id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        post_id    uuid        NOT NULL REFERENCES posts(id),
        user_id    uuid        NOT NULL REFERENCES users(id),
        created_at timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT uq_reactions_post_user UNIQUE (post_id, user_id)
      )
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS reactions`);
    await queryRunner.query(`DROP TABLE IF EXISTS comments`);
    await queryRunner.query(`DROP TABLE IF EXISTS posts`);
  }
}
