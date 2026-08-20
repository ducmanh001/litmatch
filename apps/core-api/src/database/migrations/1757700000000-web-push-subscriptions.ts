import { MigrationInterface, QueryRunner } from 'typeorm';

/** Browser Web Push subscription — mỗi endpoint duy nhất, có thể đổi owner khi user đổi account. */
export class WebPushSubscriptions1757700000000 implements MigrationInterface {
  name = 'WebPushSubscriptions1757700000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE web_push_subscriptions (
        id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id     uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        endpoint    text NOT NULL,
        p256dh      varchar(255) NOT NULL,
        auth        varchar(255) NOT NULL,
        created_at  timestamptz NOT NULL DEFAULT now(),
        updated_at  timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT uq_web_push_subscriptions_endpoint UNIQUE (endpoint)
      )
    `);
    await queryRunner.query(`
      CREATE INDEX idx_web_push_subscriptions_user
      ON web_push_subscriptions(user_id)
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('DROP TABLE IF EXISTS web_push_subscriptions');
  }
}
