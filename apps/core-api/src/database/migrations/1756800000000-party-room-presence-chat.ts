import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Party Room presence grace + realtime comments.
 * - `disconnected_at` tách rớt mạng khỏi REST leave: member còn active trong grace, reconnect
 *   thì giữ nguyên row; hết hạn mới ghi `left_at`.
 * - comments append-only, cursor theo seq và idempotency unique ở DB.
 */
export class PartyRoomPresenceChat1756800000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE party_room_members ADD COLUMN disconnected_at timestamptz NULL`,
    );
    await queryRunner.query(
      `CREATE INDEX idx_party_members_disconnect_grace
         ON party_room_members(disconnected_at, id)
         WHERE left_at IS NULL AND disconnected_at IS NOT NULL`,
    );

    await queryRunner.query(`
      CREATE TABLE party_room_comments (
        id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        seq              bigint GENERATED ALWAYS AS IDENTITY,
        room_id          uuid         NOT NULL REFERENCES party_rooms(id),
        sender_user_id   uuid         NOT NULL REFERENCES users(id),
        content          text         NOT NULL,
        idempotency_key  varchar(255) NOT NULL,
        created_at       timestamptz  NOT NULL DEFAULT now(),
        CONSTRAINT uq_party_room_comments_idempotency_key UNIQUE (idempotency_key)
      )
    `);
    await queryRunner.query(
      `CREATE INDEX idx_party_room_comments_room_seq
         ON party_room_comments(room_id, seq)`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS party_room_comments`);
    await queryRunner.query(
      `DROP INDEX IF EXISTS idx_party_members_disconnect_grace`,
    );
    await queryRunner.query(
      `ALTER TABLE party_room_members DROP COLUMN disconnected_at`,
    );
  }
}
