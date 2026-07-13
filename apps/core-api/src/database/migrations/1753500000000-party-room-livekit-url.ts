import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Giai đoạn 7 — multi-region (ADR 0005): thêm cột `livekit_url` vào `party_rooms` làm SNAPSHOT
 * URL LiveKit chốt theo region của HOST lúc tạo phòng. Cùng triết lý snapshot với
 * `speaker_limit` (migration 1752700000000): đổi config (LIVEKIT_REGION_URLS/LIVEKIT_URL) không
 * retro phòng đang sống — participant vào sau luôn nhận đúng URL đã chốt, phòng không bao giờ
 * bị "di chuyển" endpoint giữa chừng.
 *
 * NULL cho row cũ (tạo trước migration) — service fallback LIVEKIT_URL, hành vi y hệt trước.
 */
export class PartyRoomLivekitUrl1753500000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE party_rooms ADD COLUMN livekit_url varchar(512) NULL`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE party_rooms DROP COLUMN livekit_url`);
  }
}
