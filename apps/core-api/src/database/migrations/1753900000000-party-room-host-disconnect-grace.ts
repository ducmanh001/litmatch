import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Grace period cho host rớt kết nối ngoài ý muốn (docs/services/party-room-service.md § 4):
 * webhook `participant_left` cho host không đóng phòng ngay nữa mà set mốc thời gian này, chờ
 * host tự kết nối lại trong PARTY_HOST_DISCONNECT_GRACE_SECONDS trước khi thực sự đóng
 * (host_left) — REST leave chủ động (bấm "Rời phòng") vẫn đóng ngay như cũ, không qua cột này.
 */
export class PartyRoomHostDisconnectGrace1753900000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE party_rooms ADD COLUMN host_disconnected_at timestamptz NULL`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE party_rooms DROP COLUMN host_disconnected_at`,
    );
  }
}
