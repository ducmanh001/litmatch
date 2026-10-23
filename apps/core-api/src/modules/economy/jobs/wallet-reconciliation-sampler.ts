import type { DataSource } from 'typeorm';

const CHECKPOINT_KEY = 'economy-wallet-reconciliation';
const MAX_SAMPLE_SIZE = 10_000;

export interface WalletMismatch {
  userId: string;
  snapshot: string;
  derived: string;
}

interface WalletCursor {
  afterUserId: string | null;
}

interface WalletSample {
  walletMismatches: WalletMismatch[];
  sampledWallets: number;
  nextUserId: string | null;
}

/** Financial rows are read-only; only the disposable sampling cursor is persisted. */
export class WalletReconciliationSampler {
  constructor(private readonly dataSource: DataSource) {}

  async sample(size: number): Promise<WalletMismatch[]> {
    if (!Number.isSafeInteger(size) || size < 1 || size > MAX_SAMPLE_SIZE) {
      throw new RangeError(
        `Wallet sample size must be an integer in [1, ${MAX_SAMPLE_SIZE}]`,
      );
    }
    return this.dataSource.transaction(async (manager) => {
      await manager.query(
        `INSERT INTO runtime_job_checkpoints (job_key, state) VALUES ($1, $2::jsonb)
         ON CONFLICT (job_key) DO NOTHING`,
        [CHECKPOINT_KEY, JSON.stringify({ afterUserId: null })],
      );
      const [checkpoint] = (await manager.query(
        'SELECT state FROM runtime_job_checkpoints WHERE job_key = $1 FOR UPDATE',
        [CHECKPOINT_KEY],
      )) as Array<{ state: WalletCursor }>;
      const afterUserId = checkpoint?.state?.afterUserId;
      if (afterUserId !== null && typeof afterUserId !== 'string') {
        throw new Error('Wallet sampling checkpoint has an invalid cursor');
      }
      // Tail and head are disjoint PK ranges. Wrapping in this same statement keeps small
      // databases useful on every manual run and never treats an exhausted tail as a clean sample.
      // The wallet snapshot and its ledger aggregate share the statement's MVCC snapshot.
      const [page] = (await manager.query(
        `WITH tail AS MATERIALIZED (
           SELECT user_id, balance FROM wallets
            ${afterUserId === null ? '' : 'WHERE user_id > $1::uuid'}
            ORDER BY user_id LIMIT $2
         ), head AS MATERIALIZED (
           SELECT user_id, balance FROM wallets WHERE user_id <= $1::uuid
            ORDER BY user_id LIMIT GREATEST(0, $2::integer - (SELECT count(*) FROM tail))
         ), sample_wallets AS MATERIALIZED (
           SELECT * FROM tail UNION ALL SELECT * FROM head
         ), derived AS (
           SELECT la.user_id,
                  SUM(CASE WHEN le.direction = 'credit' THEN le.amount ELSE -le.amount END) AS balance
             FROM sample_wallets sw
             JOIN ledger_accounts la ON la.user_id = sw.user_id AND la.kind = 'user_wallet'
             JOIN ledger_entries le ON le.account_id = la.id
            GROUP BY la.user_id
         ), mismatches AS (
           SELECT sw.user_id AS "userId", sw.balance::text AS snapshot,
                  COALESCE(d.balance, 0)::text AS derived
             FROM sample_wallets sw LEFT JOIN derived d ON d.user_id = sw.user_id
            WHERE sw.balance <> COALESCE(d.balance, 0)
         )
         SELECT (SELECT count(*)::int FROM sample_wallets) AS "sampledWallets",
                COALESCE((SELECT user_id::text FROM head ORDER BY user_id DESC LIMIT 1),
                         (SELECT user_id::text FROM tail ORDER BY user_id DESC LIMIT 1)) AS "nextUserId",
                COALESCE((SELECT jsonb_agg(m) FROM mismatches m), '[]'::jsonb) AS "walletMismatches"`,
        [afterUserId, size],
      )) as WalletSample[];
      if (
        !page ||
        !Number.isInteger(page.sampledWallets) ||
        page.sampledWallets < 0 ||
        page.sampledWallets > size ||
        (page.sampledWallets === 0) !== (page.nextUserId === null) ||
        !Array.isArray(page.walletMismatches)
      ) {
        throw new Error('Wallet sample returned incomplete cursor metadata');
      }
      await manager.query(
        'UPDATE runtime_job_checkpoints SET state = $2::jsonb, updated_at = now() WHERE job_key = $1',
        [CHECKPOINT_KEY, JSON.stringify({ afterUserId: page.nextUserId })],
      );
      return page.walletMismatches;
    });
  }
}
