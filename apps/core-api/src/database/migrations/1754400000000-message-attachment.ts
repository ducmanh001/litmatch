import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * `Message.attachment` — cột trung lập do `friend` sở hữu (docs/plans/2026-07-14-plan-6-tinh-nang-
 * social-discovery.md § 2), dùng cho story reply (W3, snapshot mediaUrl vì story chết sau 24h,
 * message sống mãi) và video share vào chat (backlog sau). NULL cho message thường.
 */
export class MessageAttachment1754400000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE messages ADD COLUMN attachment jsonb NULL
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE messages DROP COLUMN IF EXISTS attachment`,
    );
  }
}
