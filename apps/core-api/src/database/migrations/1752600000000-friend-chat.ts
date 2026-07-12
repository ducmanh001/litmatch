import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Giai đoạn 2 — Friend Chat 1-1 (docs/services/friend-service.md).
 * Chốt chặn ở tầng DB:
 * - uq_conversations_pair + chk_conversations_canonical: mirror friendships — 1 cặp
 *   canonical (low < high) chỉ có đúng 1 conversation.
 * - uq_messages_idempotency_key: client retry không nhân đôi message (docs/05 § 5.10).
 * - messages.seq bigint IDENTITY: cursor keyset, cùng pattern soul_chat_messages.
 */
export class FriendChat1752600000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE conversations (
        id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        user_low_id      uuid        NOT NULL REFERENCES users(id),
        user_high_id     uuid        NOT NULL REFERENCES users(id),
        last_message_at  timestamptz NULL,
        created_at       timestamptz NOT NULL DEFAULT now(),
        updated_at       timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT uq_conversations_pair UNIQUE (user_low_id, user_high_id),
        CONSTRAINT chk_conversations_canonical CHECK (user_low_id < user_high_id)
      )
    `);
    // list bạn theo 1 phía (GET /friends) — uq_conversations_pair đã cover prefix user_low_id
    await queryRunner.query(
      `CREATE INDEX idx_conversations_user_high ON conversations(user_high_id)`,
    );

    await queryRunner.query(`
      CREATE TABLE messages (
        id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        seq             bigint GENERATED ALWAYS AS IDENTITY,
        conversation_id uuid         NOT NULL REFERENCES conversations(id),
        sender_user_id  uuid         NOT NULL REFERENCES users(id),
        content         text         NOT NULL,
        idempotency_key varchar(255) NOT NULL,
        created_at      timestamptz  NOT NULL DEFAULT now(),
        CONSTRAINT uq_messages_idempotency_key UNIQUE (idempotency_key)
      )
    `);
    await queryRunner.query(
      `CREATE INDEX idx_messages_conversation_seq ON messages(conversation_id, seq)`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS messages`);
    await queryRunner.query(`DROP TABLE IF EXISTS conversations`);
  }
}
