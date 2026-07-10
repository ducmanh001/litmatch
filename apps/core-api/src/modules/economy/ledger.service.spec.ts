import { DataSource } from 'typeorm';

import { LedgerService } from './ledger.service';
import { LedgerAccountKind, LedgerCurrency } from './entities/ledger-account.entity';
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
