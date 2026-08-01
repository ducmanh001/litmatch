import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Backfill lịch sử Soul Chat của các session đã mutual-like trước khi flow
 * import được triển khai. Các dòng nguồn vẫn giữ nguyên cho T&S; idempotency
 * key dùng cùng format với SoulMatchService để migration và code runtime không
 * tạo bản sao của nhau.
 */
export class SoulChatFriendHistory1756600000000 implements MigrationInterface {
  name = 'SoulChatFriendHistory1756600000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      INSERT INTO messages (
        conversation_id,
        sender_user_id,
        content,
        idempotency_key,
        created_at
      )
      SELECT
        c.id,
        scm.sender_user_id,
        scm.content,
        'friend:import:soul:' || scm.session_id::text || ':' || scm.id::text,
        scm.created_at
      FROM soul_chat_messages scm
      INNER JOIN match_sessions ms ON ms.id = scm.session_id
        AND ms.match_type = 'soul'
      INNER JOIN soul_match_ratings rating_a ON rating_a.session_id = ms.id
        AND rating_a.rater_user_id = ms.user_a_id
        AND rating_a.verdict = 'like'
      INNER JOIN soul_match_ratings rating_b ON rating_b.session_id = ms.id
        AND rating_b.rater_user_id = ms.user_b_id
        AND rating_b.verdict = 'like'
      INNER JOIN friendships f
        ON f.user_low_id = LEAST(ms.user_a_id, ms.user_b_id)
        AND f.user_high_id = GREATEST(ms.user_a_id, ms.user_b_id)
      INNER JOIN conversations c
        ON c.user_low_id = f.user_low_id
        AND c.user_high_id = f.user_high_id
      ON CONFLICT (idempotency_key) DO NOTHING
    `);

    await queryRunner.query(`
      UPDATE conversations c
      SET last_message_at = imported.latest_message_at
      FROM (
        SELECT conversation_id, MAX(created_at) AS latest_message_at
        FROM messages
        WHERE idempotency_key LIKE 'friend:import:soul:%'
        GROUP BY conversation_id
      ) imported
      WHERE c.id = imported.conversation_id
        AND (
          c.last_message_at IS NULL
          OR c.last_message_at < imported.latest_message_at
        )
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DELETE FROM messages
      WHERE idempotency_key LIKE 'friend:import:soul:%'
    `);
  }
}
