import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Video ngắn V1 (W5, docs/services/short-video-service.md, module mới `short-video`). Scope V1
 * đã chốt (2026-07-14): lifecycle + upload + view + like/comment + report/admin — KHÔNG làm
 * pin-profile/share-chat ở đợt này (đôn sang đợt sau).
 * - `chk_videos_status`: enum enforce ở DB, transition thì enforce bằng conditional UPDATE ở
 *   service (không SELECT FOR UPDATE — video không tranh chấp gay gắt như matching ticket).
 * - `uq_video_views_video_viewer` / `uq_video_reactions_video_user`: chống đếm đôi.
 */
export class ShortVideo1754800000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE videos (
        id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        author_user_id    uuid NOT NULL REFERENCES users(id),
        status            varchar(16) NOT NULL DEFAULT 'uploading'
                          CHECK (status IN ('uploading','processing','pending_review','published','removed','rejected','failed')),
        storage_key       varchar(512) NOT NULL,
        playback_url      varchar(2048) NULL,
        thumbnail_url     varchar(2048) NULL,
        caption           text NULL,
        duration_seconds  int NULL,
        view_count        int NOT NULL DEFAULT 0 CHECK (view_count >= 0),
        like_count        int NOT NULL DEFAULT 0 CHECK (like_count >= 0),
        comment_count     int NOT NULL DEFAULT 0 CHECK (comment_count >= 0),
        rank_score        double precision NULL,
        idempotency_key   varchar(255) NOT NULL,
        created_at        timestamptz NOT NULL DEFAULT now(),
        updated_at        timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT uq_videos_idempotency_key UNIQUE (idempotency_key)
      )
    `);
    await queryRunner.query(
      `CREATE INDEX idx_videos_status_created ON videos(status, created_at)`,
    );
    await queryRunner.query(
      `CREATE INDEX idx_videos_author ON videos(author_user_id)`,
    );

    await queryRunner.query(`
      CREATE TABLE video_views (
        id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        video_id      uuid NOT NULL REFERENCES videos(id) ON DELETE CASCADE,
        viewer_id     uuid NOT NULL REFERENCES users(id),
        watch_time_ms int NOT NULL DEFAULT 0,
        qualified     boolean NOT NULL DEFAULT false,
        created_at    timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT uq_video_views_video_viewer UNIQUE (video_id, viewer_id)
      )
    `);

    await queryRunner.query(`
      CREATE TABLE video_comments (
        id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        seq             bigserial NOT NULL,
        video_id        uuid NOT NULL REFERENCES videos(id) ON DELETE CASCADE,
        author_user_id  uuid NOT NULL REFERENCES users(id),
        content         text NOT NULL,
        deleted_at      timestamptz NULL,
        created_at      timestamptz NOT NULL DEFAULT now()
      )
    `);
    await queryRunner.query(
      `CREATE INDEX idx_video_comments_video_seq ON video_comments(video_id, seq)`,
    );

    await queryRunner.query(`
      CREATE TABLE video_reactions (
        id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        video_id   uuid NOT NULL REFERENCES videos(id) ON DELETE CASCADE,
        user_id    uuid NOT NULL REFERENCES users(id),
        created_at timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT uq_video_reactions_video_user UNIQUE (video_id, user_id)
      )
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS video_reactions`);
    await queryRunner.query(`DROP TABLE IF EXISTS video_comments`);
    await queryRunner.query(`DROP TABLE IF EXISTS video_views`);
    await queryRunner.query(`DROP TABLE IF EXISTS videos`);
  }
}
