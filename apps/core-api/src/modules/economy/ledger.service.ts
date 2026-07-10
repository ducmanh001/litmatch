import { createHash } from 'node:crypto';

import { Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DomainException } from '@litmatch/common-exceptions';
import { DataSource, EntityManager, IsNull } from 'typeorm';

import { EconomyErrors } from './economy.errors';
import { LedgerAccount, LedgerAccountKind, LedgerCurrency } from './entities/ledger-account.entity';
import { LedgerDirection, LedgerEntry } from './entities/ledger-entry.entity';
import { OutboxEvent } from './entities/outbox-event.entity';
import { LedgerTransaction, TransactionStatus, TransactionType } from './entities/transaction.entity';
import { Wallet } from './entities/wallet.entity';

const PG_UNIQUE_VIOLATION = '23505';
const USER_ACCOUNT_KINDS = new Set([LedgerAccountKind.UserWallet, LedgerAccountKind.UserEarnings]);

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
  /** Chạy trong CÙNG DB transaction sau khi ghi sổ (vd set VIP expiry, lưu receipt) — fail thì rollback cả sổ. */
  withinTransaction?: (manager: EntityManager, transaction: LedgerTransaction) => Promise<void>;
}

export interface RecordResult {
  transaction: LedgerTransaction;
  /** true = request trùng idempotency key, trả lại giao dịch cũ, không ghi gì thêm. */
  replayed: boolean;
}

/**
 * WRITER DUY NHẤT vào ledger/wallet (docs/services/economy-service.md § 3).
 * Mọi bất biến tiền bạc sống ở đây + các chốt chặn DB (unique key, CHECK, trigger append-only).
 * Không service nào khác được inject repository của ledger_entries/wallets để ghi.
 */
@Injectable()
export class LedgerService {
  constructor(@InjectDataSource() private readonly dataSource: DataSource) {}

  async record(input: RecordTransactionInput): Promise<RecordResult> {
    this.validateEntries(input.entries);
    const requestHash = this.hashRequest(input);

    // Fast path: key đã tồn tại → replay (check trước để không tốn transaction)
    const existing = await this.dataSource.getRepository(LedgerTransaction).findOneBy({
      idempotencyKey: input.idempotencyKey,
    });
    if (existing) return { transaction: this.assertSameRequest(existing, requestHash), replayed: true };

    try {
      const transaction = await this.dataSource.transaction(async (manager) => {
        // Insert transaction TRƯỚC — unique constraint trên idempotency_key là chốt chặn
        // cuối cho 2 request song song cùng key (bên thua nhận 23505, xử lý ở catch dưới)
        const txn = await manager.save(
          manager.create(LedgerTransaction, {
            type: input.type,
            status: TransactionStatus.Completed,
            idempotencyKey: input.idempotencyKey,
            requestHash,
            actorUserId: input.actorUserId ?? null,
            reversalOf: input.reversalOf ?? null,
            metadata: input.metadata ?? {},
          }),
        );

        const accounts = await Promise.all(input.entries.map((e) => this.resolveAccount(manager, e)));

        // Điểm tuần tự hoá per-user: lock các ví theo thứ tự userId cố định (tránh deadlock)
        const userIds = [...new Set(input.entries.filter((e) => e.userId).map((e) => e.userId as string))].sort();
        const wallets = new Map<string, Wallet>();
        for (const userId of userIds) {
          wallets.set(userId, await this.lockWallet(manager, userId));
        }

        await manager.save(
          input.entries.map((entry, i) =>
            manager.create(LedgerEntry, {
              transactionId: txn.id,
              accountId: accounts[i].id,
              direction: entry.direction,
              amount: entry.amount.toString(),
              currency: entry.currency,
            }),
          ),
        );

        await this.applyWalletDeltas(manager, txn, input.entries, wallets);
        await input.withinTransaction?.(manager, txn);
        return txn;
      });
      return { transaction, replayed: false };
    } catch (err) {
      if ((err as { code?: string }).code === PG_UNIQUE_VIOLATION && (err as Error).message.includes('idempotency')) {
        const winner = await this.dataSource
          .getRepository(LedgerTransaction)
          .findOneByOrFail({ idempotencyKey: input.idempotencyKey });
        return { transaction: this.assertSameRequest(winner, requestHash), replayed: true };
      }
      throw err;
    }
  }

  /**
   * Bút toán đảo (docs/06): KHÔNG sửa/xoá giao dịch gốc — tạo transaction mới với
   * các entry đảo chiều, trỏ `reversalOf` về gốc. An toàn dưới race bằng UPDATE
   * có điều kiện status: 2 request cùng reverse thì chỉ 1 bên thắng.
   */
  async reverse(originalTransactionId: string, idempotencyKey: string, reason: string): Promise<RecordResult> {
    const original = await this.dataSource
      .getRepository(LedgerTransaction)
      .findOneBy({ id: originalTransactionId });
    if (!original) {
      throw new DomainException(EconomyErrors.TRANSACTION_NOT_FOUND, 'Không tìm thấy giao dịch gốc', 404);
    }
    if (original.status === TransactionStatus.Reversed) {
      throw new DomainException(EconomyErrors.TRANSACTION_ALREADY_REVERSED, 'Giao dịch đã được hoàn trước đó', 409);
    }

    const entries = await this.dataSource.getRepository(LedgerEntry).findBy({ transactionId: original.id });
    const accounts = await this.dataSource.getRepository(LedgerAccount).findBy(
      entries.map((e) => ({ id: e.accountId })),
    );
    const accountById = new Map(accounts.map((a) => [a.id, a]));

    return this.record({
      type: TransactionType.Reversal,
      idempotencyKey,
      actorUserId: original.actorUserId ?? undefined,
      reversalOf: original.id,
      metadata: { reason, originalType: original.type },
      entries: entries.map((e) => {
        const account = accountById.get(e.accountId);
        if (!account) throw new Error(`Ledger account ${e.accountId} biến mất — dữ liệu hỏng`);
        return {
          accountKind: account.kind,
          userId: account.userId ?? undefined,
          direction: e.direction === LedgerDirection.Debit ? LedgerDirection.Credit : LedgerDirection.Debit,
          amount: BigInt(e.amount),
          currency: e.currency,
        };
      }),
      withinTransaction: async (manager) => {
        const marked = await manager.update(
          LedgerTransaction,
          { id: original.id, status: TransactionStatus.Completed },
          { status: TransactionStatus.Reversed },
        );
        if (!marked.affected) {
          // request khác vừa reverse xong trước — rollback toàn bộ bút toán đảo của mình
          throw new DomainException(EconomyErrors.TRANSACTION_ALREADY_REVERSED, 'Giao dịch đã được hoàn trước đó', 409);
        }
      },
    });
  }

  /** Rebuild snapshot từ ledger gốc — dùng khi nghi lệch (luật 2: ledger là nguồn sự thật). */
  async rebuildWallet(userId: string): Promise<Wallet> {
    return this.dataSource.transaction(async (manager) => {
      const wallet = await this.lockWallet(manager, userId);
      wallet.balance = (await this.deriveBalance(manager, userId, LedgerAccountKind.UserWallet)).toString();
      wallet.earnings = (await this.deriveBalance(manager, userId, LedgerAccountKind.UserEarnings)).toString();
      return manager.save(wallet);
    });
  }

  async deriveBalance(manager: EntityManager, userId: string, kind: LedgerAccountKind): Promise<bigint> {
    const row: { balance: string | null } | undefined = await manager
      .createQueryBuilder(LedgerEntry, 'le')
      .innerJoin(LedgerAccount, 'la', 'la.id = le.account_id')
      .select(
        `COALESCE(SUM(CASE WHEN le.direction = 'credit' THEN le.amount ELSE -le.amount END), 0)`,
        'balance',
      )
      .where('la.user_id = :userId AND la.kind = :kind', { userId, kind })
      .getRawOne();
    return BigInt(row?.balance ?? 0);
  }

  // ---------- nội bộ ----------

  private validateEntries(entries: LedgerEntryInput[]): void {
    if (entries.length < 2) throw new Error('Giao dịch double-entry cần tối thiểu 2 bút toán');
    const sums = new Map<string, bigint>();
    for (const e of entries) {
      if (e.amount <= 0n) throw new Error('Bút toán phải có amount nguyên dương');
      if (USER_ACCOUNT_KINDS.has(e.accountKind) && !e.userId) {
        throw new Error(`Tài khoản ${e.accountKind} bắt buộc có userId`);
      }
      const delta = e.direction === LedgerDirection.Debit ? e.amount : -e.amount;
      sums.set(e.currency, (sums.get(e.currency) ?? 0n) + delta);
    }
    for (const [currency, sum] of sums) {
      if (sum !== 0n) {
        throw new Error(`Tổng Nợ != tổng Có cho currency ${currency} — vi phạm bất biến double-entry`);
      }
    }
  }

  private hashRequest(input: RecordTransactionInput): string {
    const normalized = {
      type: input.type,
      actorUserId: input.actorUserId ?? null,
      reversalOf: input.reversalOf ?? null,
      entries: input.entries.map((e) => ({
        k: e.accountKind,
        u: e.userId ?? null,
        d: e.direction,
        a: e.amount.toString(),
        c: e.currency,
      })),
    };
    return createHash('sha256').update(JSON.stringify(normalized)).digest('hex');
  }

  private assertSameRequest(existing: LedgerTransaction, requestHash: string): LedgerTransaction {
    if (existing.requestHash !== requestHash) {
      throw new DomainException(
        EconomyErrors.IDEMPOTENCY_CONFLICT,
        'Idempotency key đã dùng cho 1 request khác nội dung',
        409,
      );
    }
    return existing;
  }

  private async resolveAccount(manager: EntityManager, entry: LedgerEntryInput): Promise<LedgerAccount> {
    const isUserAccount = USER_ACCOUNT_KINDS.has(entry.accountKind);
    const where = {
      kind: entry.accountKind,
      // SQL NULL không match bằng '=' — tài khoản hệ thống phải query bằng IsNull()
      userId: isUserAccount ? (entry.userId as string) : IsNull(),
      currency: entry.currency,
    };
    const found = await manager.getRepository(LedgerAccount).findOneBy(where);
    if (found) return found;
    try {
      return await manager.save(
        manager.create(LedgerAccount, {
          kind: entry.accountKind,
          userId: isUserAccount ? (entry.userId as string) : null,
          currency: entry.currency,
        }),
      );
    } catch (err) {
      if ((err as { code?: string }).code === PG_UNIQUE_VIOLATION) {
        return manager.getRepository(LedgerAccount).findOneByOrFail(where);
      }
      throw err;
    }
  }

  private async lockWallet(manager: EntityManager, userId: string): Promise<Wallet> {
    // Ví tạo lazy, idempotent — sau đó lock FOR UPDATE làm điểm tuần tự hoá per-user
    await manager.query(`INSERT INTO wallets (user_id) VALUES ($1) ON CONFLICT (user_id) DO NOTHING`, [userId]);
    const wallet = await manager
      .getRepository(Wallet)
      .createQueryBuilder('w')
      .setLock('pessimistic_write')
      .where('w.user_id = :userId', { userId })
      .getOne();
    if (!wallet) throw new Error(`Không lock được ví của user ${userId}`);
    return wallet;
  }

  private async applyWalletDeltas(
    manager: EntityManager,
    txn: LedgerTransaction,
    entries: LedgerEntryInput[],
    wallets: Map<string, Wallet>,
  ): Promise<void> {
    for (const [userId, wallet] of wallets) {
      let balanceDelta = 0n;
      let earningsDelta = 0n;
      for (const e of entries) {
        if (e.userId !== userId) continue;
        const signed = e.direction === LedgerDirection.Credit ? e.amount : -e.amount;
        if (e.accountKind === LedgerAccountKind.UserWallet) balanceDelta += signed;
        if (e.accountKind === LedgerAccountKind.UserEarnings) earningsDelta += signed;
      }

      const newBalance = BigInt(wallet.balance) + balanceDelta;
      const newEarnings = BigInt(wallet.earnings) + earningsDelta;
      // Reversal/Adjustment (refund, chargeback, sửa sai admin) ĐƯỢC PHÉP đẩy balance âm = user nợ
      // diamond (docs/services/economy-service.md § 5); giao dịch tiêu tiền thường thì KHÔNG.
      const mayGoNegative =
        txn.type === TransactionType.Reversal || txn.type === TransactionType.Adjustment;
      if (newBalance < 0n && !mayGoNegative) {
        // Xác minh lại ĐÚNG THỜI ĐIỂM trừ tiền (docs/10 § 10.0.C) — không tin check ở đầu luồng
        throw new DomainException(
          EconomyErrors.WALLET_INSUFFICIENT_BALANCE,
          'Không đủ diamond',
          422,
          { required: (-newBalance).toString() },
        );
      }
      if (newEarnings < 0n) {
        throw new DomainException(EconomyErrors.WALLET_INSUFFICIENT_BALANCE, 'Không đủ điểm quy đổi', 422);
      }

      wallet.balance = newBalance.toString();
      wallet.earnings = newEarnings.toString();
      await manager.save(wallet);

      // Outbox: event ghi CÙNG transaction (docs/03 § 3.6), relay publish sau
      if (balanceDelta !== 0n) {
        await manager.save(
          manager.create(OutboxEvent, {
            topic: 'litmatch.economy.events',
            eventType: balanceDelta > 0n ? 'economy.diamond.credited' : 'economy.diamond.debited',
            payload: {
              version: 1,
              transactionId: txn.id,
              transactionType: txn.type,
              userId,
              amount: (balanceDelta > 0n ? balanceDelta : -balanceDelta).toString(),
            },
          }),
        );
      }
    }
  }
}
