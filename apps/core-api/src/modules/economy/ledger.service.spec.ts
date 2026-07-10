import { DataSource, EntityManager } from 'typeorm';

import { LedgerService } from './ledger.service';
import { LedgerAccount, LedgerAccountKind, LedgerCurrency } from './entities/ledger-account.entity';
import { LedgerDirection } from './entities/ledger-entry.entity';
import { TransactionType } from './entities/transaction.entity';
import { EconomyErrors } from './economy.errors';

/**
 * Unit test cho bất biến thuần (không cần DB) — hành vi transactional/race thật
 * nằm ở economy.integration.spec.ts chạy trên Postgres.
 */
describe('LedgerService (validation thuần)', () => {
  const findOneBy = jest.fn();
  const dataSource = {
    getRepository: () => ({ findOneBy }),
    transaction: jest.fn(),
  } as unknown as DataSource;
  const service = new LedgerService(dataSource);

  const entry = (over: Partial<Parameters<LedgerService['record']>[0]['entries'][0]> = {}) => ({
    accountKind: LedgerAccountKind.SystemIap,
    direction: LedgerDirection.Debit,
    amount: 100n,
    currency: LedgerCurrency.Diamond,
    ...over,
  });

  beforeEach(() => jest.clearAllMocks());

  it('từ chối giao dịch mất cân đối Nợ/Có', async () => {
    await expect(
      service.record({
        type: TransactionType.Adjustment,
        idempotencyKey: 'k1',
        entries: [entry(), entry({ direction: LedgerDirection.Credit, amount: 99n, accountKind: LedgerAccountKind.SystemRevenue })],
      }),
    ).rejects.toThrow(/Tổng Nợ != tổng Có/);
  });

  it('từ chối cân đối chéo currency (100 DIA nợ + 100 PTS có KHÔNG phải là cân đối)', async () => {
    await expect(
      service.record({
        type: TransactionType.Adjustment,
        idempotencyKey: 'k2',
        entries: [
          entry(),
          entry({ direction: LedgerDirection.Credit, currency: LedgerCurrency.Points, accountKind: LedgerAccountKind.SystemPointsMint }),
        ],
      }),
    ).rejects.toThrow(/currency/);
  });

  it('từ chối amount âm/0 và giao dịch < 2 bút toán', async () => {
    await expect(
      service.record({ type: TransactionType.Adjustment, idempotencyKey: 'k3', entries: [entry()] }),
    ).rejects.toThrow(/tối thiểu 2 bút toán/);
    await expect(
      service.record({
        type: TransactionType.Adjustment,
        idempotencyKey: 'k4',
        entries: [entry({ amount: 0n }), entry({ amount: 0n, direction: LedgerDirection.Credit })],
      }),
    ).rejects.toThrow(/nguyên dương/);
  });

  it('tài khoản user_* bắt buộc có userId', async () => {
    await expect(
      service.record({
        type: TransactionType.Adjustment,
        idempotencyKey: 'k5',
        entries: [
          entry({ accountKind: LedgerAccountKind.UserWallet }),
          entry({ direction: LedgerDirection.Credit, accountKind: LedgerAccountKind.SystemRevenue }),
        ],
      }),
    ).rejects.toThrow(/userId/);
  });

  it('replay: cùng key + cùng nội dung → trả giao dịch cũ, không mở transaction mới', async () => {
    const balanced = [
      entry(),
      entry({ direction: LedgerDirection.Credit, accountKind: LedgerAccountKind.SystemRevenue }),
    ];
    // requestHash phải khớp — tính bằng chính service qua 1 lần record giả trước đó
    findOneBy.mockResolvedValue({ id: 't1', requestHash: expect.anything() });
    findOneBy.mockResolvedValue({
      id: 't1',
      requestHash: (service as unknown as { hashRequest: (i: unknown) => string }).hashRequest({
        type: TransactionType.Adjustment,
        actorUserId: 'u1',
        entries: balanced,
      }),
    });
    const result = await service.record({
      type: TransactionType.Adjustment,
      actorUserId: 'u1', // Adjustment bắt buộc actor để audit (docs/10 § Economy)
      idempotencyKey: 'k6',
      entries: balanced,
    });
    expect(result.replayed).toBe(true);
    expect(dataSource.transaction).not.toHaveBeenCalled();
  });

  it('cùng key nhưng nội dung KHÁC → 409 ECONOMY_TRANSACTION_IDEMPOTENCY_CONFLICT', async () => {
    findOneBy.mockResolvedValue({ id: 't1', requestHash: 'x'.repeat(64) });
    await expect(
      service.record({
        type: TransactionType.Adjustment,
        actorUserId: 'u1',
        idempotencyKey: 'k7',
        entries: [entry(), entry({ direction: LedgerDirection.Credit, accountKind: LedgerAccountKind.SystemRevenue })],
      }),
    ).rejects.toMatchObject({ code: EconomyErrors.IDEMPOTENCY_CONFLICT, httpStatus: 409 });
  });

  it('requestHash canonical metadata: không phụ thuộc thứ tự key, nhưng đổi business payload phải đổi hash', () => {
    const hashRequest = (service as unknown as { hashRequest: (input: unknown) => string }).hashRequest.bind(service);
    const entries = [entry(), entry({ direction: LedgerDirection.Credit, accountKind: LedgerAccountKind.SystemRevenue })];
    const base = { type: TransactionType.Reversal, actorUserId: 'u1', reversalOf: 'original-1', entries };

    const first = hashRequest({ ...base, metadata: { reason: 'refund', nested: { ticketId: 't1', planId: 'p1' } } });
    const reordered = hashRequest({ ...base, metadata: { nested: { planId: 'p1', ticketId: 't1' }, reason: 'refund' } });
    const changed = hashRequest({ ...base, metadata: { reason: 'refund', nested: { ticketId: 't2', planId: 'p1' } } });

    expect(reordered).toBe(first);
    expect(changed).not.toBe(first);
  });

  it('resolveAccount dùng INSERT ON CONFLICT, không bắt 23505 trong transaction đã aborted', async () => {
    const account = Object.assign(new LedgerAccount(), {
      id: 'account-1',
      kind: LedgerAccountKind.SystemIap,
      userId: null,
      currency: LedgerCurrency.Diamond,
    });
    const accountRepo = {
      findOneBy: jest.fn().mockResolvedValue(null),
      findOneByOrFail: jest.fn().mockResolvedValue(account),
    };
    const manager = {
      getRepository: jest.fn(() => accountRepo),
      query: jest.fn().mockResolvedValue([]),
    } as unknown as EntityManager;
    const resolveAccount = (
      service as unknown as {
        resolveAccount: (m: EntityManager, e: ReturnType<typeof entry>) => Promise<LedgerAccount>;
      }
    ).resolveAccount.bind(service);

    await expect(resolveAccount(manager, entry())).resolves.toBe(account);
    expect(manager.query).toHaveBeenCalledWith(expect.stringContaining('ON CONFLICT DO NOTHING'), [
      LedgerAccountKind.SystemIap,
      null,
      LedgerCurrency.Diamond,
    ]);
    expect(accountRepo.findOneByOrFail).toHaveBeenCalled();
  });

  it('reverse replay cùng key nhưng khác reason phải conflict', async () => {
    findOneBy.mockResolvedValue({
      id: 'reversal-1',
      type: TransactionType.Reversal,
      reversalOf: 'original-1',
      actorUserId: null,
      metadata: { reason: 'store_refund' },
    });

    await expect(service.reverse('original-1', 'reverse-key-1', 'admin_adjustment')).rejects.toMatchObject({
      code: EconomyErrors.IDEMPOTENCY_CONFLICT,
      httpStatus: 409,
    });
    expect(dataSource.transaction).not.toHaveBeenCalled();
  });

  it('reverse replay cùng key, original và reason trả transaction cũ để saga recovery hội tụ', async () => {
    findOneBy.mockResolvedValue({
      id: 'reversal-1',
      type: TransactionType.Reversal,
      reversalOf: 'original-1',
      actorUserId: null,
      metadata: { reason: 'ticket_not_queued' },
    });

    await expect(service.reverse('original-1', 'reverse-key-1', 'ticket_not_queued')).resolves.toMatchObject({
      replayed: true,
      transaction: { id: 'reversal-1' },
    });
    expect(dataSource.transaction).not.toHaveBeenCalled();
  });

  it('type=adjustment bắt buộc actorUserId để audit (docs/10 § Economy) — thiếu actor phải bị chặn', async () => {
    await expect(
      service.record({
        type: TransactionType.Adjustment,
        idempotencyKey: 'k8',
        entries: [entry(), entry({ direction: LedgerDirection.Credit, accountKind: LedgerAccountKind.SystemRevenue })],
      }),
    ).rejects.toThrow(/actorUserId/);
  });
});
