import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Voice Match phải có terminal state durable, không giữ người dùng trong session cũ sau khi
 * call kết thúc/rời phòng. Reactions là consent 2 chiều; chỉ hai lượt like mới tạo Friendship.
 */
export class VoiceMatchCompletion1756000000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE match_sessions
        DROP CONSTRAINT IF EXISTS match_sessions_status_check;
      ALTER TABLE match_sessions
        ADD CONSTRAINT match_sessions_status_check
        CHECK (status IN ('pending_confirm', 'confirmed', 'ended', 'expired'));
    `);
    await queryRunner.query(`
      CREATE TABLE voice_match_reactions (
        id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        call_id      uuid NOT NULL REFERENCES call_sessions(id),
        rater_user_id uuid NOT NULL REFERENCES users(id),
        created_at   timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT uq_voice_match_reactions_call_rater UNIQUE (call_id, rater_user_id)
      );
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS voice_match_reactions`);
    await queryRunner.query(`
      ALTER TABLE match_sessions
        DROP CONSTRAINT IF EXISTS match_sessions_status_check;
      ALTER TABLE match_sessions
        ADD CONSTRAINT match_sessions_status_check
        CHECK (status IN ('pending_confirm', 'confirmed', 'expired'));
    `);
  }
}
