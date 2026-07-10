import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Refund/chargeback (docs/services/economy-service.md § 5):
 * - `refund_transaction_id`: audit trail nối receipt gốc với giao dịch đảo đã hoàn nó.
 * - `refund_checked_at`: watermark cho job quét backstop (IapRefundPollService) — order theo
 *   cột này (NULLS FIRST) để mỗi run tiến sang lô receipt khác, không đứng yên ở 200 receipt
 *   cũ nhất mãi mãi (receipt không refund thì không đổi trạng thái nên không tự "rớt" khỏi lô cũ).
 */
export class EconomyRefund1752100000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE iap_receipts
      ADD COLUMN refund_transaction_id uuid NULL REFERENCES transactions(id),
      ADD COLUMN refund_checked_at timestamptz NULL
    `);
    await queryRunner.query(
      `CREATE INDEX idx_iap_receipts_refund_checked ON iap_receipts(refund_checked_at) WHERE status = 'credited'`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS idx_iap_receipts_refund_checked`);
    await queryRunner.query(`ALTER TABLE iap_receipts DROP COLUMN refund_transaction_id, DROP COLUMN refund_checked_at`);
  }
}
