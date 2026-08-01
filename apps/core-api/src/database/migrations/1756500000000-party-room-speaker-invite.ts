import { MigrationInterface, QueryRunner } from 'typeorm';

/** Lời mời speaker phải tồn tại durable để reload không làm mất bước consent. */
export class PartyRoomSpeakerInvite1756500000000 implements MigrationInterface {
  name = 'PartyRoomSpeakerInvite1756500000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE party_room_members
      ADD COLUMN speaker_invite_pending boolean NOT NULL DEFAULT false
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE party_room_members DROP COLUMN speaker_invite_pending`,
    );
  }
}
