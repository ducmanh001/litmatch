import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Giai đoạn 1 — Economy double-entry ledger (docs/services/economy-service.md).
 * Chốt chặn ở tầng DB, không chỉ ở code:
 * - transactions.idempotency_key UNIQUE (luật 2 CLAUDE.md)
 * - ledger_entries: TRIGGER chặn UPDATE/DELETE — append-only tuyệt đối
 * - wallets.balance KHÔNG đặt CHECK >= 0: số dư âm là trạng thái hợp lệ sau refund/chargeback
 *   (user nợ diamond — docs/services/economy-service.md § 5). Chống tiêu quá số dư là guard
 *   tầng ứng dụng (SELECT ... FOR UPDATE + balance - amount >= 0), không phải constraint snapshot.
 * - amount CHECK > 0, bigint — không float, không bút toán 0/âm
 */
export class EconomyLedger1752000000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE ledger_accounts (
        id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        kind        varchar(32)  NOT NULL,
        user_id     uuid         NULL REFERENCES users(id),
        currency    varchar(8)   NOT NULL DEFAULT 'DIA',
        created_at  timestamptz  NOT NULL DEFAULT now()
      )
    `);
    // 1 tài khoản duy nhất cho mỗi (kind, user, currency); tài khoản hệ thống user_id NULL
    await queryRunner.query(
      `CREATE UNIQUE INDEX uq_ledger_accounts_user ON ledger_accounts(kind, user_id, currency) WHERE user_id IS NOT NULL`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX uq_ledger_accounts_system ON ledger_accounts(kind, currency) WHERE user_id IS NULL`,
    );

    await queryRunner.query(`
      CREATE TABLE transactions (
        id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        type             varchar(32)  NOT NULL,
        status           varchar(16)  NOT NULL DEFAULT 'completed',
        idempotency_key  varchar(255) NOT NULL,
        request_hash     char(64)     NOT NULL,
        actor_user_id    uuid         NULL REFERENCES users(id),
        reversal_of      uuid         NULL REFERENCES transactions(id),
        metadata         jsonb        NOT NULL DEFAULT '{}',
        created_at       timestamptz  NOT NULL DEFAULT now(),
        CONSTRAINT uq_transactions_idempotency_key UNIQUE (idempotency_key)
      )
    `);
    await queryRunner.query(
      `CREATE INDEX idx_transactions_actor_created ON transactions(actor_user_id, created_at DESC)`,
    );

    await queryRunner.query(`
      CREATE TABLE ledger_entries (
        id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        transaction_id  uuid        NOT NULL REFERENCES transactions(id),
        account_id      uuid        NOT NULL REFERENCES ledger_accounts(id),
        direction       varchar(6)  NOT NULL CHECK (direction IN ('debit','credit')),
        amount          bigint      NOT NULL CHECK (amount > 0),
        currency        varchar(8)  NOT NULL,
        created_at      timestamptz NOT NULL DEFAULT now()
      )
    `);
    await queryRunner.query(
      `CREATE INDEX idx_ledger_entries_transaction ON ledger_entries(transaction_id)`,
    );
    await queryRunner.query(
      `CREATE INDEX idx_ledger_entries_account_created ON ledger_entries(account_id, created_at DESC)`,
    );

    // Append-only tuyệt đối: chặn ngay ở DB, mọi cách "sửa" đều phải đi qua reversal transaction
    await queryRunner.query(`
      CREATE OR REPLACE FUNCTION forbid_ledger_entry_mutation() RETURNS trigger AS $$
      BEGIN
        RAISE EXCEPTION 'ledger_entries la append-only — tao reversal transaction thay vi sua/xoa (docs/03 § 3.8.C)';
      END;
      $$ LANGUAGE plpgsql
    `);
    await queryRunner.query(`
      CREATE TRIGGER trg_ledger_entries_append_only
      BEFORE UPDATE OR DELETE ON ledger_entries
      FOR EACH ROW EXECUTE FUNCTION forbid_ledger_entry_mutation()
    `);

    await queryRunner.query(`
      CREATE TABLE wallets (
        user_id         uuid PRIMARY KEY REFERENCES users(id),
        -- balance CÓ THỂ âm sau refund/chargeback (user nợ diamond) — không đặt CHECK >= 0
        balance         bigint      NOT NULL DEFAULT 0,
        -- earnings (PTS) chỉ được cộng ở giai đoạn này (chưa có luồng tiêu) → vẫn giữ CHECK >= 0
        earnings        bigint      NOT NULL DEFAULT 0 CHECK (earnings >= 0),
        vip_tier        varchar(16) NULL,
        vip_expires_at  timestamptz NULL,
        updated_at      timestamptz NOT NULL DEFAULT now()
      )
    `);

    await queryRunner.query(`
      CREATE TABLE iap_products (
        product_id  varchar(128) PRIMARY KEY,
        provider    varchar(16)  NOT NULL,
        diamonds    bigint       NOT NULL CHECK (diamonds > 0),
        active      boolean      NOT NULL DEFAULT true,
        created_at  timestamptz  NOT NULL DEFAULT now()
      )
    `);

    await queryRunner.query(`
      CREATE TABLE vip_plans (
        id             varchar(64) PRIMARY KEY,
        tier           varchar(16) NOT NULL,
        days           integer     NOT NULL CHECK (days > 0),
        price_diamond  bigint      NOT NULL CHECK (price_diamond > 0),
        active         boolean     NOT NULL DEFAULT true,
        created_at     timestamptz NOT NULL DEFAULT now()
      )
    `);

    await queryRunner.query(`
      CREATE TABLE iap_receipts (
        id                       uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        provider                 varchar(16)  NOT NULL,
        provider_transaction_id  varchar(255) NOT NULL,
        user_id                  uuid         NOT NULL REFERENCES users(id),
        product_id               varchar(128) NOT NULL,
        status                   varchar(16)  NOT NULL DEFAULT 'credited',
        transaction_id           uuid         NULL REFERENCES transactions(id),
        raw_payload              jsonb        NOT NULL DEFAULT '{}',
        created_at               timestamptz  NOT NULL DEFAULT now(),
        CONSTRAINT uq_iap_receipts_provider_txn UNIQUE (provider, provider_transaction_id)
      )
    `);

    await queryRunner.query(`
      CREATE TABLE outbox_events (
        id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        topic         varchar(128) NOT NULL,
        event_type    varchar(64)  NOT NULL,
        payload       jsonb        NOT NULL,
        attempts      integer      NOT NULL DEFAULT 0,
        published_at  timestamptz  NULL,
        created_at    timestamptz  NOT NULL DEFAULT now()
      )
    `);
    await queryRunner.query(
      `CREATE INDEX idx_outbox_events_unpublished ON outbox_events(created_at) WHERE published_at IS NULL`,
    );

    // Seed mẫu (product id thật thay khi đăng ký store — docs/services/economy-service.md)
    await queryRunner.query(`
      INSERT INTO iap_products (product_id, provider, diamonds) VALUES
        ('com.litmatch.diamond.100',  'google', 100),
        ('com.litmatch.diamond.550',  'google', 550),
        ('com.litmatch.diamond.1200', 'google', 1200),
        ('lm.diamond.100',  'apple', 100),
        ('lm.diamond.550',  'apple', 550),
        ('lm.diamond.1200', 'apple', 1200)
    `);
    await queryRunner.query(`
      INSERT INTO vip_plans (id, tier, days, price_diamond) VALUES
        ('vip-30d',  'vip',  30, 500),
        ('svip-30d', 'svip', 30, 1200)
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS outbox_events`);
    await queryRunner.query(`DROP TABLE IF EXISTS iap_receipts`);
    await queryRunner.query(`DROP TABLE IF EXISTS vip_plans`);
    await queryRunner.query(`DROP TABLE IF EXISTS iap_products`);
    await queryRunner.query(`DROP TABLE IF EXISTS wallets`);
    await queryRunner.query(
      `DROP TRIGGER IF EXISTS trg_ledger_entries_append_only ON ledger_entries`,
    );
    await queryRunner.query(
      `DROP FUNCTION IF EXISTS forbid_ledger_entry_mutation`,
    );
    await queryRunner.query(`DROP TABLE IF EXISTS ledger_entries`);
    await queryRunner.query(`DROP TABLE IF EXISTS transactions`);
    await queryRunner.query(`DROP TABLE IF EXISTS ledger_accounts`);
  }
}
