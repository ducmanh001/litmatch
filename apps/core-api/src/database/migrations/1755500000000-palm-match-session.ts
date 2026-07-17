import { MigrationInterface, QueryRunner } from 'typeorm';

export class PalmMatchSession1755500000000 implements MigrationInterface {
  name = 'PalmMatchSession1755500000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE friendships DROP CONSTRAINT IF EXISTS friendships_source_check
    `);
    await queryRunner.query(`
      ALTER TABLE friendships ADD CONSTRAINT chk_friendships_source
      CHECK (source IN ('soul_match', 'voice_match', 'palm_match'))
    `);
    await queryRunner.query(`
      CREATE TABLE palm_match_sessions (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        user_low_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        user_high_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        low_sign varchar(24) NOT NULL,
        high_sign varchar(24) NOT NULL,
        compatibility_percent smallint NOT NULL,
        fortune text NOT NULL,
        low_flipped_at timestamptz NULL,
        high_flipped_at timestamptz NULL,
        low_rating varchar(8) NULL,
        high_rating varchar(8) NULL,
        status varchar(16) NOT NULL DEFAULT 'active',
        outcome varchar(16) NULL,
        expires_at timestamptz NOT NULL,
        closed_at timestamptz NULL,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT chk_palm_match_pair_canonical CHECK (user_low_id < user_high_id),
        CONSTRAINT chk_palm_match_compatibility CHECK (compatibility_percent BETWEEN 60 AND 99),
        CONSTRAINT chk_palm_match_low_rating CHECK (low_rating IS NULL OR low_rating IN ('like', 'skip')),
        CONSTRAINT chk_palm_match_high_rating CHECK (high_rating IS NULL OR high_rating IN ('like', 'skip')),
        CONSTRAINT chk_palm_match_status CHECK (status IN ('active', 'completed')),
        CONSTRAINT chk_palm_match_outcome CHECK (outcome IS NULL OR outcome IN ('matched', 'not_matched', 'expired', 'cancelled')),
        CONSTRAINT chk_palm_match_terminal CHECK (
          (status = 'active' AND outcome IS NULL AND closed_at IS NULL)
          OR (status = 'completed' AND outcome IS NOT NULL AND closed_at IS NOT NULL)
        )
      )
    `);
    await queryRunner.query(`
      CREATE INDEX idx_palm_match_sessions_expires_at
      ON palm_match_sessions (expires_at) WHERE status = 'active'
    `);
    await queryRunner.query(`
      CREATE TABLE palm_match_queue_entries (
        user_id uuid PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
        queued_at timestamptz NOT NULL DEFAULT now()
      )
    `);
    await queryRunner.query(`
      CREATE INDEX idx_palm_match_queue_order ON palm_match_queue_entries (queued_at, user_id)
    `);
    await queryRunner.query(`
      CREATE TABLE palm_match_active_participants (
        user_id uuid PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
        session_id uuid NOT NULL REFERENCES palm_match_sessions(id) ON DELETE CASCADE,
        created_at timestamptz NOT NULL DEFAULT now()
      )
    `);
    await queryRunner.query(`
      CREATE INDEX idx_palm_match_active_session ON palm_match_active_participants (session_id)
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('DROP TABLE palm_match_active_participants');
    await queryRunner.query('DROP TABLE palm_match_queue_entries');
    await queryRunner.query('DROP TABLE palm_match_sessions');
    await queryRunner.query(`
      ALTER TABLE friendships DROP CONSTRAINT IF EXISTS chk_friendships_source
    `);
    await queryRunner.query(`
      ALTER TABLE friendships ADD CONSTRAINT friendships_source_check
      CHECK (source IN ('soul_match', 'voice_match'))
    `);
  }
}
