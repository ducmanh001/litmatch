import { MigrationInterface, QueryRunner } from 'typeorm';

/** Thêm profile gift làm context thứ ba của GiftEvent. */
export class ProfileGiftContext1757500000000 implements MigrationInterface {
  name = 'ProfileGiftContext1757500000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE gift_events ADD COLUMN profile_user_id uuid REFERENCES users(id)`,
    );
    await queryRunner.query(
      `ALTER TABLE gift_events DROP CONSTRAINT IF EXISTS chk_gift_events_context`,
    );
    await queryRunner.query(`
      ALTER TABLE gift_events
      ADD CONSTRAINT chk_gift_events_context
      CHECK (
        (CASE WHEN room_id IS NULL THEN 0 ELSE 1 END) +
        (CASE WHEN video_id IS NULL THEN 0 ELSE 1 END) +
        (CASE WHEN profile_user_id IS NULL THEN 0 ELSE 1 END) = 1
      )
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE gift_events DROP CONSTRAINT IF EXISTS chk_gift_events_context`,
    );
    await queryRunner.query(`
      ALTER TABLE gift_events
      ADD CONSTRAINT chk_gift_events_context
      CHECK ((room_id IS NULL) <> (video_id IS NULL))
    `);
    await queryRunner.query(
      `ALTER TABLE gift_events DROP COLUMN IF EXISTS profile_user_id`,
    );
  }
}
