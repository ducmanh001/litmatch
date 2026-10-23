import type { DataSource } from 'typeorm';

/** This row contains diagnostic progress only, never financial source-of-truth data. */
const CHECKPOINT_KEY = 'economy-ledger-reconciliation';

interface CheckpointState {
  cursorAt: string | null;
  cursorId: string | null;
  sums: Record<string, string>;
  completedBefore: string | null;
  rebasedAt: number | null;
  rebuilding: boolean;
}

export interface LedgerReconciliationProgress {
  imbalances: Array<{ currency: string; imbalance: string }>;
  complete: boolean;
  completedBefore: string | null;
}

const initialState = (): CheckpointState => ({
  cursorAt: null,
  cursorId: null,
  sums: {},
  completedBefore: null,
  rebasedAt: null,
  rebuilding: true,
});

/** Page whole transactions and atomically persist their aggregate with the cursor. */
export class LedgerReconciliationCheckpoint {
  constructor(private readonly dataSource: DataSource) {}

  async advance(options: {
    lagMs: number;
    fullIntervalMs: number;
    batchSize: number;
    maxBatches: number;
    budgetMs: number;
  }): Promise<LedgerReconciliationProgress> {
    const deadline = Date.now() + options.budgetMs;
    let progress: LedgerReconciliationProgress = {
      imbalances: [],
      complete: false,
      completedBefore: null,
    };
    for (let batch = 0; batch < options.maxBatches; batch++) {
      if (batch > 0 && Date.now() >= deadline) break;
      progress = await this.advancePage(options);
      if (progress.complete) break;
    }
    return progress;
  }

  private async advancePage(options: {
    lagMs: number;
    fullIntervalMs: number;
    batchSize: number;
  }): Promise<LedgerReconciliationProgress> {
    return this.dataSource.transaction(async (manager) => {
      await manager.query(
        `INSERT INTO runtime_job_checkpoints (job_key, state) VALUES ($1, $2::jsonb)
         ON CONFLICT (job_key) DO NOTHING`,
        [CHECKPOINT_KEY, JSON.stringify(initialState())],
      );
      const [checkpoint] = (await manager.query(
        `SELECT state,
                (clock_timestamp() - ($2::double precision * interval '1 millisecond'))::text AS cutoff,
                (extract(epoch FROM clock_timestamp()) * 1000)::bigint::text AS "nowMs"
           FROM runtime_job_checkpoints WHERE job_key = $1 FOR UPDATE`,
        [CHECKPOINT_KEY, options.lagMs],
      )) as Array<{ state: CheckpointState; cutoff: string; nowMs: string }>;
      let state = checkpoint.state;
      const nowMs = Number(checkpoint.nowMs);
      if (
        !state.rebuilding &&
        state.rebasedAt !== null &&
        nowMs - state.rebasedAt >= options.fullIntervalMs
      ) {
        state = initialState();
      }
      const parameters: unknown[] = [checkpoint.cutoff, options.batchSize];
      if (state.cursorAt !== null)
        parameters.push(state.cursorAt, state.cursorId);
      const [page] = (await manager.query(
        `WITH batch AS MATERIALIZED (
           SELECT id, created_at FROM transactions
            WHERE created_at < $1::timestamptz
              ${state.cursorAt === null ? '' : 'AND (created_at, id) > ($3::timestamptz, $4::uuid)'}
            ORDER BY created_at, id LIMIT $2
         ), deltas AS (
           SELECT le.currency,
                  SUM(CASE WHEN le.direction = 'debit' THEN le.amount ELSE -le.amount END)::text AS delta
             FROM batch b JOIN ledger_entries le ON le.transaction_id = b.id
            GROUP BY le.currency
         )
         SELECT (SELECT count(*)::int FROM batch) AS count,
                (SELECT created_at::text FROM batch ORDER BY created_at DESC, id DESC LIMIT 1) AS at,
                (SELECT id::text FROM batch ORDER BY created_at DESC, id DESC LIMIT 1) AS id,
                COALESCE((SELECT jsonb_object_agg(currency, delta) FROM deltas), '{}'::jsonb) AS sums`,
        parameters,
      )) as Array<{
        count: number;
        at: string | null;
        id: string | null;
        sums: Record<string, string>;
      }>;
      for (const [currency, delta] of Object.entries(page.sums)) {
        state.sums[currency] = (
          BigInt(state.sums[currency] ?? '0') + BigInt(delta)
        ).toString();
      }
      if (page.count > 0) {
        state.cursorAt = page.at;
        state.cursorId = page.id;
      }
      const complete = page.count < options.batchSize;
      if (complete) {
        state.completedBefore = checkpoint.cutoff;
        if (state.rebuilding) state.rebasedAt = nowMs;
        state.rebuilding = false;
      }
      await manager.query(
        'UPDATE runtime_job_checkpoints SET state = $2::jsonb, updated_at = now() WHERE job_key = $1',
        [CHECKPOINT_KEY, JSON.stringify(state)],
      );
      return {
        imbalances: Object.entries(state.sums)
          .filter(([, amount]) => BigInt(amount) !== 0n)
          .map(([currency, imbalance]) => ({ currency, imbalance })),
        complete,
        completedBefore: complete ? state.completedBefore : null,
      };
    });
  }
}
