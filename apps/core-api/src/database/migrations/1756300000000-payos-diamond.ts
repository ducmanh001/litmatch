import { MigrationInterface, QueryRunner } from 'typeorm';

/** payOS web top-up: order snapshot + DB uniqueness, không tạo ledger entry trước webhook. */
export class PayosDiamond1756300000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    // payOS nhận number nên dùng sequence 16 chữ số vẫn < Number.MAX_SAFE_INTEGER.
    await queryRunner.query(
      `CREATE SEQUENCE IF NOT EXISTS payos_order_code_seq START WITH 1760000000000000 INCREMENT BY 1`,
    );
    await queryRunner.query(`
      CREATE TABLE payos_packages (
        package_id varchar(64) PRIMARY KEY,
        amount_vnd bigint NOT NULL CHECK (amount_vnd > 0),
        diamonds bigint NOT NULL CHECK (diamonds > 0),
        active boolean NOT NULL DEFAULT true,
        created_at timestamptz NOT NULL DEFAULT now()
      )
    `);
    await queryRunner.query(`
      CREATE TABLE payos_payment_orders (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id uuid NOT NULL REFERENCES users(id),
        package_id varchar(64) NOT NULL REFERENCES payos_packages(package_id),
        amount_vnd bigint NOT NULL CHECK (amount_vnd > 0),
        diamonds bigint NOT NULL CHECK (diamonds > 0),
        currency varchar(3) NOT NULL DEFAULT 'VND' CHECK (currency = 'VND'),
        order_code bigint NOT NULL DEFAULT nextval('payos_order_code_seq'),
        idempotency_key varchar(255) NOT NULL,
        request_hash char(64) NOT NULL,
        status varchar(32) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'paid', 'cancelled', 'expired')),
        payment_link_id varchar(128) NULL,
        checkout_url text NULL,
        qr_code text NULL,
        expires_at timestamptz NOT NULL,
        transaction_id uuid NULL REFERENCES transactions(id),
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT uq_payos_payment_orders_order_code UNIQUE (order_code),
        CONSTRAINT uq_payos_payment_orders_idempotency_key UNIQUE (idempotency_key),
        CONSTRAINT uq_payos_payment_orders_payment_link_id UNIQUE (payment_link_id),
        CONSTRAINT uq_payos_payment_orders_transaction_id UNIQUE (transaction_id)
      )
    `);
    await queryRunner.query(
      `CREATE INDEX idx_payos_payment_orders_user_created ON payos_payment_orders(user_id, created_at DESC)`,
    );
    // Sequence thuộc lifecycle của bảng để dropSchema/test DB và migration down không để orphan.
    await queryRunner.query(
      `ALTER SEQUENCE payos_order_code_seq OWNED BY payos_payment_orders.order_code`,
    );
    await queryRunner.query(`
      INSERT INTO payos_packages (package_id, amount_vnd, diamonds) VALUES
        ('vn-10000', 10000, 100),
        ('vn-50000', 50000, 550),
        ('vn-100000', 100000, 1200)
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS payos_payment_orders`);
    await queryRunner.query(`DROP TABLE IF EXISTS payos_packages`);
    await queryRunner.query(`DROP SEQUENCE IF EXISTS payos_order_code_seq`);
  }
}
