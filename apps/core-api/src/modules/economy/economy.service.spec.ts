import { Repository } from 'typeorm';

import { EconomyErrors } from './economy.errors';
import { EconomyService } from './economy.service';
import { LedgerService } from './ledger.service';
import { IapProduct, IapProvider } from './entities/iap.entities';
import { LedgerTransaction, TransactionType } from './entities/transaction.entity';
import { VipPlan } from './entities/vip-plan.entity';
import { Wallet } from './entities/wallet.entity';
import { IapVerifier } from './services/iap-verifier';

import { UserService } from '../user';

describe('EconomyService guest policy', () => {
  const walletRepo = {} as Repository<Wallet>;
  const productRepo = { findOneBy: jest.fn() } as unknown as Repository<IapProduct>;
  const planRepo = { findOneBy: jest.fn() } as unknown as Repository<VipPlan>;
  const txnRepo = {} as Repository<LedgerTransaction>;
  const ledger = { record: jest.fn() } as unknown as LedgerService;
  const iapVerifier = { verify: jest.fn() } as unknown as IapVerifier;
  const userService = { getByIdOrThrow: jest.fn() } as unknown as UserService;
  const service = new EconomyService(
    walletRepo,
    productRepo,
    planRepo,
    txnRepo,
    ledger,
    iapVerifier,
    userService,
  );

  beforeEach(() => {
    jest.clearAllMocks();
    (userService.getByIdOrThrow as jest.Mock).mockResolvedValue({ id: 'guest-1', isGuest: true });
  });

  it.each([
    [
      'nạp IAP',
      () => service.creditFromIap('guest-1', IapProvider.Google, { purchaseToken: 'token' }, 'product-1'),
    ],
    ['mua VIP', () => service.purchaseVip('guest-1', 'vip-30d', 'idem-1')],
    [
      'spend diamond nội bộ',
      () =>
        service.spendDiamond({
          userId: 'guest-1',
          amount: 50n,
          type: TransactionType.MatchingSpeedup,
          idempotencyKey: 'speedup-1',
        }),
    ],
  ])('chặn guest %s bằng trạng thái authoritative từ DB', async (_name, action) => {
    await expect(action()).rejects.toMatchObject({ code: EconomyErrors.GUEST_FORBIDDEN, httpStatus: 403 });
    expect(userService.getByIdOrThrow).toHaveBeenCalledWith('guest-1');
    expect(productRepo.findOneBy).not.toHaveBeenCalled();
    expect(planRepo.findOneBy).not.toHaveBeenCalled();
    expect(iapVerifier.verify).not.toHaveBeenCalled();
    expect(ledger.record).not.toHaveBeenCalled();
  });

  it('spendDiamond chặn transaction type có thể lạm balance âm / giả mạo luồng IAP', async () => {
    (userService.getByIdOrThrow as jest.Mock).mockResolvedValue({ id: 'user-1', isGuest: false });

    await expect(
      service.spendDiamond({
        userId: 'user-1',
        amount: 50n,
        type: TransactionType.Adjustment,
        idempotencyKey: 'bad-type-1',
      }),
    ).rejects.toMatchObject({ code: EconomyErrors.TRANSACTION_TYPE_INVALID, httpStatus: 400 });
    expect(userService.getByIdOrThrow).not.toHaveBeenCalled();
    expect(ledger.record).not.toHaveBeenCalled();
  });
});
