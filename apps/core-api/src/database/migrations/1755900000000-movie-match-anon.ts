import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Movie Match ghép ẩn danh (movie-match.html): queue + cột phase/rating trên movie_sessions
 * + chat theo session. Additive — session bạn bè cũ nhận mode='friend', các cột mới NULL.
 */
export class MovieMatchAnon1755900000000 implements MigrationInterface {
  name = 'MovieMatchAnon1755900000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    // Nới CHECK friendships.source cho nguồn mới 'movie_match' (mutual-like phiên ẩn danh)
    await queryRunner.query(`
      ALTER TABLE friendships DROP CONSTRAINT IF EXISTS friendships_source_check
    `);
    await queryRunner.query(`
      ALTER TABLE friendships DROP CONSTRAINT IF EXISTS chk_friendships_source
    `);
    await queryRunner.query(`
      ALTER TABLE friendships ADD CONSTRAINT chk_friendships_source
      CHECK (source IN ('soul_match', 'voice_match', 'palm_match', 'movie_match'))
    `);
    await queryRunner.query(`
      ALTER TABLE movie_sessions
      ADD COLUMN mode varchar(12) NOT NULL DEFAULT 'friend',
      ADD COLUMN expires_at timestamptz,
      ADD COLUMN watch_ended_at timestamptz,
      ADD COLUMN low_rating varchar(8),
      ADD COLUMN high_rating varchar(8),
      ADD COLUMN outcome varchar(12)
    `);
    await queryRunner.query(`
      CREATE TABLE movie_match_queue_entries (
        user_id uuid PRIMARY KEY,
        queued_at timestamptz NOT NULL DEFAULT now()
      )
    `);
    await queryRunner.query(`
      CREATE TABLE movie_session_messages (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        seq bigint GENERATED ALWAYS AS IDENTITY,
        session_id uuid NOT NULL REFERENCES movie_sessions(id) ON DELETE CASCADE,
        sender_user_id uuid NOT NULL,
        content text NOT NULL,
        idempotency_key varchar(255) NOT NULL UNIQUE,
        created_at timestamptz NOT NULL DEFAULT now()
      )
    `);
    await queryRunner.query(`
      CREATE INDEX idx_movie_session_messages_session_seq
      ON movie_session_messages(session_id, seq)
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE friendships DROP CONSTRAINT IF EXISTS chk_friendships_source
    `);
    await queryRunner.query(`
      ALTER TABLE friendships ADD CONSTRAINT chk_friendships_source
      CHECK (source IN ('soul_match', 'voice_match', 'palm_match'))
    `);
    await queryRunner.query(`DROP TABLE IF EXISTS movie_session_messages`);
    await queryRunner.query(`DROP TABLE IF EXISTS movie_match_queue_entries`);
    await queryRunner.query(`
      ALTER TABLE movie_sessions
      DROP COLUMN IF EXISTS mode,
      DROP COLUMN IF EXISTS expires_at,
      DROP COLUMN IF EXISTS watch_ended_at,
      DROP COLUMN IF EXISTS low_rating,
      DROP COLUMN IF EXISTS high_rating,
      DROP COLUMN IF EXISTS outcome
    `);
  }
}
