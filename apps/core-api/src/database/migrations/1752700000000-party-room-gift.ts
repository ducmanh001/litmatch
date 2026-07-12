import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Giai đoạn 3 — Party Room + Gift (docs/services/party-room-service.md, gift-service.md).
 * Chốt chặn ở tầng DB:
 * - uq_party_members_active_room_user: 1 user chỉ có 1 membership active/phòng (rejoin = row mới).
 * - uq_party_members_active_user: 1 user chỉ ở trong 1 phòng active tại 1 thời điểm.
 * - chk_party_rooms_speaker_limit: speaker_limit snapshot từ config phải >= 1.
 * - uq_gift_events_transaction: 1 GiftEvent ↔ 1 Transaction tiền (idempotency mapping 1:1).
 * - Số tiền/điểm trên gift_events chỉ là SNAPSHOT hiển thị — nguồn sự thật vẫn là ledger_entries.
 */
export class PartyRoomGift1752700000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE party_rooms (
        id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        host_user_id   uuid         NOT NULL REFERENCES users(id),
        title          varchar(500) NOT NULL,
        status         varchar(16)  NOT NULL DEFAULT 'active',
        speaker_limit  int          NOT NULL,
        close_reason   varchar(32)  NULL,
        closed_at      timestamptz  NULL,
        created_at     timestamptz  NOT NULL DEFAULT now(),
        updated_at     timestamptz  NOT NULL DEFAULT now(),
        CONSTRAINT chk_party_rooms_speaker_limit CHECK (speaker_limit >= 1)
      )
    `);
    // list phòng active (GET /party/rooms) + sweeper quét theo status
    await queryRunner.query(
      `CREATE INDEX idx_party_rooms_status_created ON party_rooms(status, created_at)`,
    );

    await queryRunner.query(`
      CREATE TABLE party_room_members (
        id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        room_id     uuid        NOT NULL REFERENCES party_rooms(id),
        user_id     uuid        NOT NULL REFERENCES users(id),
        role        varchar(16) NOT NULL,
        joined_at   timestamptz NOT NULL DEFAULT now(),
        left_at     timestamptz NULL,
        created_at  timestamptz NOT NULL DEFAULT now(),
        updated_at  timestamptz NOT NULL DEFAULT now()
      )
    `);
    // Membership active là partial unique — rejoin sau khi rời tạo row MỚI (giữ lịch sử)
    await queryRunner.query(
      `CREATE UNIQUE INDEX uq_party_members_active_room_user
         ON party_room_members(room_id, user_id) WHERE left_at IS NULL`,
    );
    // 1 user 1 phòng active (docs/services/party-room-service.md § 3) — cùng tinh thần
    // "1 user 1 queue matching" của docs/06
    await queryRunner.query(
      `CREATE UNIQUE INDEX uq_party_members_active_user
         ON party_room_members(user_id) WHERE left_at IS NULL`,
    );
    // Đếm speaker active dưới lock phòng + list member active
    await queryRunner.query(
      `CREATE INDEX idx_party_members_room_active
         ON party_room_members(room_id, role) WHERE left_at IS NULL`,
    );

    await queryRunner.query(`
      CREATE TABLE gifts (
        id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        code           varchar(64)  NOT NULL,
        name           varchar(128) NOT NULL,
        price_diamond  int          NOT NULL,
        active         boolean      NOT NULL DEFAULT true,
        sort_order     int          NOT NULL DEFAULT 0,
        created_at     timestamptz  NOT NULL DEFAULT now(),
        updated_at     timestamptz  NOT NULL DEFAULT now(),
        CONSTRAINT uq_gifts_code UNIQUE (code),
        CONSTRAINT chk_gifts_price_positive CHECK (price_diamond > 0)
      )
    `);

    await queryRunner.query(`
      CREATE TABLE gift_events (
        id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        gift_id             uuid        NOT NULL REFERENCES gifts(id),
        room_id             uuid        NOT NULL REFERENCES party_rooms(id),
        sender_user_id      uuid        NOT NULL REFERENCES users(id),
        receiver_user_id    uuid        NOT NULL REFERENCES users(id),
        price_diamond       int         NOT NULL,
        points_awarded      int         NOT NULL,
        points_rate_percent int         NOT NULL,
        transaction_id      uuid        NOT NULL REFERENCES transactions(id),
        created_at          timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT uq_gift_events_transaction UNIQUE (transaction_id),
        CONSTRAINT chk_gift_events_no_self_gift CHECK (sender_user_id <> receiver_user_id),
        CONSTRAINT chk_gift_events_points_lte_price CHECK (points_awarded <= price_diamond)
      )
    `);
    await queryRunner.query(
      `CREATE INDEX idx_gift_events_room_created ON gift_events(room_id, created_at)`,
    );
    // Xếp hạng/lịch sử nhận quà (docs/06: PTS giai đoạn đầu chỉ hiển thị + xếp hạng)
    await queryRunner.query(
      `CREATE INDEX idx_gift_events_receiver_created ON gift_events(receiver_user_id, created_at)`,
    );

    // Seed catalog mẫu — giá là DATA trong DB (đổi bằng UPDATE/admin, không phải env config);
    // code là khoá ổn định cho client map asset/animation
    await queryRunner.query(`
      INSERT INTO gifts (code, name, price_diamond, sort_order) VALUES
        ('rose',   'Hoa hồng',   1,    1),
        ('heart',  'Trái tim',   5,    2),
        ('candy',  'Kẹo ngọt',   10,   3),
        ('teddy',  'Gấu bông',   99,   4),
        ('crown',  'Vương miện', 500,  5),
        ('castle', 'Lâu đài',    4999, 6)
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS gift_events`);
    await queryRunner.query(`DROP TABLE IF EXISTS gifts`);
    await queryRunner.query(`DROP TABLE IF EXISTS party_room_members`);
    await queryRunner.query(`DROP TABLE IF EXISTS party_rooms`);
  }
}
