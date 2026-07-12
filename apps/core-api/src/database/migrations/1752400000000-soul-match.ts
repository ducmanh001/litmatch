import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Giai đoạn 2 — Soul Match (docs/services/soul-match-service.md) + Friend slice tối thiểu.
 * Chốt chặn ở tầng DB, không chỉ ở code:
 * - uq_friendships_pair + chk_friendships_canonical: quan hệ 2 chiều lưu đúng 1 dòng theo cặp
 *   (low < high) — chốt cuối chống tạo đôi khi 2 rating "like" chạy song song.
 * - uq_soul_match_ratings_session_rater: 1 người 1 verdict/session (idempotency tự nhiên,
 *   rating immutable — docs/10 § Soul Match).
 * - uq_soul_chat_messages_idempotency_key: client retry không nhân đôi message (docs/05 § 5.10).
 * - soul_chat_messages.seq bigint IDENTITY: thứ tự DB cấp cho cursor keyset (không dùng
 *   created_at — trùng mili-giây làm phân trang trùng/mất dòng); bảng append-only, không updated_at.
 */
export class SoulMatch1752400000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE friendships (
        id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        user_low_id  uuid        NOT NULL REFERENCES users(id),
        user_high_id uuid        NOT NULL REFERENCES users(id),
        source       varchar(16) NOT NULL CHECK (source IN ('soul_match','voice_match')),
        created_at   timestamptz NOT NULL DEFAULT now(),
        updated_at   timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT uq_friendships_pair UNIQUE (user_low_id, user_high_id),
        CONSTRAINT chk_friendships_canonical CHECK (user_low_id < user_high_id)
      )
    `);
    // list bạn theo 1 phía về sau (Friend Chat 1-1) — uq_friendships_pair đã cover prefix user_low_id
    await queryRunner.query(
      `CREATE INDEX idx_friendships_user_high ON friendships(user_high_id)`,
    );

    await queryRunner.query(`
      CREATE TABLE soul_match_ratings (
        id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        session_id    uuid        NOT NULL REFERENCES match_sessions(id),
        rater_user_id uuid        NOT NULL REFERENCES users(id),
        verdict       varchar(8)  NOT NULL CHECK (verdict IN ('rude','boring','like')),
        created_at    timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT uq_soul_match_ratings_session_rater UNIQUE (session_id, rater_user_id)
      )
    `);

    await queryRunner.query(`
      CREATE TABLE soul_chat_messages (
        id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        seq             bigint GENERATED ALWAYS AS IDENTITY,
        session_id      uuid         NOT NULL REFERENCES match_sessions(id),
        sender_user_id  uuid         NOT NULL REFERENCES users(id),
        content         text         NOT NULL,
        idempotency_key varchar(255) NOT NULL,
        created_at      timestamptz  NOT NULL DEFAULT now(),
        CONSTRAINT uq_soul_chat_messages_idempotency_key UNIQUE (idempotency_key)
      )
    `);
    // poll history theo cursor: WHERE session_id = ? AND seq > ? ORDER BY seq
    await queryRunner.query(
      `CREATE INDEX idx_soul_chat_messages_session_seq ON soul_chat_messages(session_id, seq)`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS soul_chat_messages`);
    await queryRunner.query(`DROP TABLE IF EXISTS soul_match_ratings`);
    await queryRunner.query(`DROP TABLE IF EXISTS friendships`);
  }
}
