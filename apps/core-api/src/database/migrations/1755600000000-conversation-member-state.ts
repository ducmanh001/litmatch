import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Trạng thái đọc/mute cá nhân theo (conversation, user) — additive, lazy row (vắng dòng =
 * chưa đọc gì và không mute) nên KHÔNG cần backfill dữ liệu cũ.
 */
export class ConversationMemberState1755600000000 implements MigrationInterface {
  name = 'ConversationMemberState1755600000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE conversation_member_states (
        conversation_id uuid NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
        user_id uuid NOT NULL,
        last_read_at timestamptz,
        muted_at timestamptz,
        PRIMARY KEY (conversation_id, user_id)
      )
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS conversation_member_states`);
  }
}
