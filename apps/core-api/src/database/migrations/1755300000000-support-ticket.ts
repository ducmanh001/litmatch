import { MigrationInterface, QueryRunner } from 'typeorm';

export class SupportTicket1755300000000 implements MigrationInterface {
  name = 'SupportTicket1755300000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE support_tickets (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        category varchar(16) NOT NULL,
        message varchar(2000) NOT NULL,
        status varchar(16) NOT NULL DEFAULT 'open',
        staff_response varchar(2000) NULL,
        idempotency_key varchar(128) NOT NULL,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT chk_support_ticket_category
          CHECK (category IN ('feedback', 'bug', 'idea')),
        CONSTRAINT chk_support_ticket_status
          CHECK (status IN ('open', 'in_progress', 'resolved', 'closed')),
        CONSTRAINT uq_support_ticket_user_idempotency
          UNIQUE (user_id, idempotency_key)
      )
    `);
    await queryRunner.query(`
      CREATE INDEX idx_support_tickets_user_created
      ON support_tickets(user_id, created_at DESC, id DESC)
    `);
    await queryRunner.query(`
      CREATE INDEX idx_support_tickets_status_created
      ON support_tickets(status, created_at DESC, id DESC)
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS support_tickets`);
  }
}
