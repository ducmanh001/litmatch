import { MigrationInterface, QueryRunner } from 'typeorm';

export class PartyRoomCategory1755200000000 implements MigrationInterface {
  name = 'PartyRoomCategory1755200000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE party_rooms
      ADD COLUMN category varchar(16) NOT NULL DEFAULT 'talk'
    `);
    await queryRunner.query(`
      CREATE INDEX idx_party_rooms_status_category_created
      ON party_rooms(status, category, created_at DESC, id DESC)
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP INDEX IF EXISTS idx_party_rooms_status_category_created`,
    );
    await queryRunner.query(
      `ALTER TABLE party_rooms DROP COLUMN IF EXISTS category`,
    );
  }
}
