import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Gift mở rộng ra ngoài Party Room: tặng quà cho tác giả video (video.html "Tặng").
 * `room_id` nới thành nullable + thêm `video_id` — CHECK bảo đảm đúng 1 context/1 event.
 * Dữ liệu cũ toàn bộ là quà trong phòng (room_id NOT NULL) nên thoả CHECK, không cần backfill.
 */
export class GiftEventVideo1755700000000 implements MigrationInterface {
  name = 'GiftEventVideo1755700000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE gift_events ALTER COLUMN room_id DROP NOT NULL`,
    );
    await queryRunner.query(`ALTER TABLE gift_events ADD COLUMN video_id uuid`);
    await queryRunner.query(`
      ALTER TABLE gift_events
      ADD CONSTRAINT chk_gift_events_context
      CHECK ((room_id IS NULL) <> (video_id IS NULL))
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE gift_events DROP CONSTRAINT IF EXISTS chk_gift_events_context`,
    );
    await queryRunner.query(
      `ALTER TABLE gift_events DROP COLUMN IF EXISTS video_id`,
    );
    await queryRunner.query(
      `ALTER TABLE gift_events ALTER COLUMN room_id SET NOT NULL`,
    );
  }
}
