import type { EntityManager } from 'typeorm';

import type {
  LedgerAccountKind,
  LedgerCurrency,
} from '../entities/ledger-account.entity';
import type { LedgerDirection } from '../entities/ledger-entry.entity';
import type {
  LedgerTransaction,
  TransactionType,
} from '../entities/transaction.entity';
import type { Wallet } from '../entities/wallet.entity';

export interface LedgerEntryInput {
  accountKind: LedgerAccountKind;
  userId?: string;
  direction: LedgerDirection;
  amount: bigint;
  currency: LedgerCurrency;
}

export interface RecordTransactionInput {
  type: TransactionType;
  idempotencyKey: string;
  entries: LedgerEntryInput[];
  actorUserId?: string;
  metadata?: Record<string, unknown>;
  reversalOf?: string;
  /**
   * Explicit same-transaction escape hatch for a caller-owned side effect
   * (receipt, GiftEvent, audit record). The TypeORM handle is intentionally
   * visible here: replacing the database requires replacing this adapter and
   * its atomic side-effect integration together, not a generic CRUD wrapper.
   */
  withinTransaction?: (
    manager: EntityManager,
    transaction: LedgerTransaction,
  ) => Promise<void>;
  /**
   * Refund/reversal event type when the default balance-delta event is too
   * generic for the durable event contract.
   */
  outboxEventTypeOverride?: string;
}

export interface RecordResult {
  transaction: LedgerTransaction;
  /** Replay by idempotency key; no second ledger write was made. */
  replayed: boolean;
}

/**
 * Economy's replaceable persistence boundary.
 *
 * The implementation owns PostgreSQL-specific constraints, raw SQL, account
 * creation, wallet locking and the ledger/outbox transaction. It is not a
 * generic repository: record/reverse/rebuild are intentionally aggregate
 * operations whose atomicity is part of the contract.
 */
export abstract class LedgerPersistencePort {
  abstract record(input: RecordTransactionInput): Promise<RecordResult>;

  abstract reverse(
    originalTransactionId: string,
    idempotencyKey: string,
    reason: string,
    opts?: {
      actorUserId?: string | null;
      outboxEventTypeOverride?: string;
      withinTransaction?: (
        manager: EntityManager,
        reversalTransaction: LedgerTransaction,
      ) => Promise<void>;
    },
  ): Promise<RecordResult>;

  abstract rebuildWallet(userId: string): Promise<Wallet>;

  /** Read-side ledger derivation used by reconciliation/rebuild tooling. */
  abstract deriveBalance(
    manager: EntityManager,
    userId: string,
    kind: LedgerAccountKind,
  ): Promise<bigint>;
}
