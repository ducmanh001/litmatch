import { MigrationInterface, QueryRunner } from 'typeorm';

/** Permanent friend voice calls after a mutual Voice Match like. */
export class FriendCalling1757200000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE call_sessions
        ALTER COLUMN match_session_id DROP NOT NULL,
        ADD COLUMN call_kind varchar(16) NOT NULL DEFAULT 'voice_match'
          CHECK (call_kind IN ('voice_match', 'friend'))
    `);
    await queryRunner.query(`
      CREATE UNIQUE INDEX uq_call_sessions_active_friend_pair
        ON call_sessions (user_a_id, user_b_id)
        WHERE call_kind = 'friend' AND status IN ('pending', 'active')
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP INDEX IF EXISTS uq_call_sessions_active_friend_pair`,
    );
    // Friend calls have no MatchSession to backfill; they belong to this migration's
    // feature and are removed when rolling the feature schema back.
    await queryRunner.query(
      `DELETE FROM call_sessions WHERE call_kind = 'friend'`,
    );
    await queryRunner.query(`
      ALTER TABLE call_sessions
        DROP COLUMN IF EXISTS call_kind,
        ALTER COLUMN match_session_id SET NOT NULL
    `);
  }
}
