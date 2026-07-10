import { DataSource } from 'typeorm';

import { SnakeNamingStrategy } from '../../database/snake-naming.strategy';
import { InitAuthUser1751900000000 } from '../../database/migrations/1751900000000-init-auth-user';
import { EconomyLedger1752000000000 } from '../../database/migrations/1752000000000-economy-ledger';
import { EconomyRefund1752100000000 } from '../../database/migrations/1752100000000-economy-refund';
import { AuthIdentity } from '../auth/entities/auth-identity.entity';
import { PhoneOtp } from '../auth/entities/phone-otp.entity';
import { RefreshToken } from '../auth/entities/refresh-token.entity';
import { User } from '../user/entities/user.entity';
import { UserService } from '../user/user.service';

import { EconomyService } from './economy.service';
import { EconomyErrors } from './economy.errors';
import { LedgerService } from './ledger.service';
import { LedgerAccount } from './entities/ledger-account.entity';
import { LedgerEntry } from './entities/ledger-entry.entity';
import { OutboxEvent } from './entities/outbox-event.entity';
import { LedgerTransaction, TransactionStatus } from './entities/transaction.entity';
import { Wallet } from './entities/wallet.entity';
import { IapProduct, IapProvider, IapReceipt } from './entities/iap.entities';
import { VipPlan } from './entities/vip-plan.entity';
import { ReconciliationService } from './services/reconciliation.service';
import { RefundService } from './services/refund.service';

import type { ConfigService } from '@nestjs/config';
import type { SchedulerRegistry } from '@nestjs/schedule';
import type { IapVerifier } from './services/iap-verifier';

/**
 * Integration test TIỀN BẠC trên Postgres thật (docs/05 § 5.9 — bắt buộc cho Economy):
 * race 2 request song song, idempotent replay, CHECK không âm, trigger append-only, đối soát.
 * Chạy khi có INTEGRATION_DB_URL (CI luôn set; local: xem CLAUDE.md).
 */
const INTEGRATION_DB_URL = process.env['INTEGRATION_DB_URL'];
const d = INTEGRATION_DB_URL ? describe : describe.skip;
if (!INTEGRATION_DB_URL) {
  // eslint-disable-next-line no-console
  console.warn('[economy.integration] BỎ QUA — set INTEGRATION_DB_URL để chạy bộ test race trên Postgres thật');
}

jest.setTimeout(60_000);

d('Economy integration (Postgres thật)', () => {
  let ds: DataSource;
  let ledger: LedgerService;
  let economy: EconomyService;
  let refundService: RefundService;
  let userA: string;

  const stubVerifier: IapVerifier = {
    verify: async (_p: IapProvider, payload: Record<string, unknown>) => ({
      providerTransactionId: String(payload['devTransactionId']),
    }),
  } as IapVerifier;

  beforeAll(async () => {
    // Tạo database test nếu chưa có (tách khỏi DB dev để dropSchema an toàn)
    const url = new URL(INTEGRATION_DB_URL as string);
    const dbName = url.pathname.slice(1);
    const adminUrl = new URL(INTEGRATION_DB_URL as string);
    adminUrl.pathname = '/postgres';
    const admin = new DataSource({ type: 'postgres', url: adminUrl.toString() });
    await admin.initialize();
    const exists = await admin.query(`SELECT 1 FROM pg_database WHERE datname = $1`, [dbName]);
    if (exists.length === 0) await admin.query(`CREATE DATABASE "${dbName}"`);
    await admin.destroy();

    ds = new DataSource({
      type: 'postgres',
      url: INTEGRATION_DB_URL,
      entities: [
        User, AuthIdentity, RefreshToken, PhoneOtp,
        LedgerAccount, LedgerTransaction, LedgerEntry, Wallet, IapProduct, IapReceipt, VipPlan, OutboxEvent,
      ],
      migrations: [InitAuthUser1751900000000, EconomyLedger1752000000000, EconomyRefund1752100000000],
      namingStrategy: new SnakeNamingStrategy(),
      synchronize: false,
      dropSchema: true, // DB test riêng — làm sạch mỗi lần chạy
    });
    await ds.initialize();
    await ds.runMigrations();

    ledger = new LedgerService(ds);
    economy = new EconomyService(
      ds.getRepository(Wallet),
      ds.getRepository(IapProduct),
      ds.getRepository(VipPlan),
      ds.getRepository(LedgerTransaction),
      ledger,
      stubVerifier,
      new UserService(ds.getRepository(User), {} as ConfigService),
    );
    refundService = new RefundService(ds.getRepository(IapReceipt), ds.getRepository(LedgerTransaction), ledger);

    const user = await ds.getRepository(User).save(
      ds.getRepository(User).create({ nickname: 'test-A', avatarId: 'default-01', isGuest: false }),
    );
    userA = user.id;
  });

  afterAll(async () => {
    await ds?.destroy();
  });

  it('IAP credit: gửi receipt 2 lần chỉ credit 1 lần (idempotency theo provider txn id)', async () => {
    const first = await economy.creditFromIap(userA, IapProvider.Google, { devTransactionId: 'gpa-0001' }, 'com.litmatch.diamond.100');
    expect(first.replayed).toBe(false);
    const second = await economy.creditFromIap(userA, IapProvider.Google, { devTransactionId: 'gpa-0001' }, 'com.litmatch.diamond.100');
    expect(second.replayed).toBe(true);
    expect(second.transactionId).toBe(first.transactionId);

    const wallet = await economy.getWallet(userA);
    expect(wallet.balance).toBe('100');
    // receipt chỉ được ghi 1 lần
    expect(await ds.getRepository(IapReceipt).countBy({ providerTransactionId: 'gpa-0001' })).toBe(1);
  });

  it('10 request VIP song song CÙNG idempotency key → trừ tiền đúng 1 lần', async () => {
    await economy.creditFromIap(userA, IapProvider.Google, { devTransactionId: 'gpa-0002' }, 'com.litmatch.diamond.1200');
    const before = BigInt((await economy.getWallet(userA)).balance);

    const results = await Promise.allSettled(
      Array.from({ length: 10 }, () => economy.purchaseVip(userA, 'vip-30d', 'same-key-001')),
    );
    const fulfilled = results.filter((r) => r.status === 'fulfilled');
    expect(fulfilled.length).toBe(10); // tất cả thành công — nhưng chỉ 1 lần ghi sổ thật
    const fresh = fulfilled.filter((r) => r.status === 'fulfilled' && !r.value.replayed);
    expect(fresh.length).toBe(1);

    const after = BigInt((await economy.getWallet(userA)).balance);
    expect(before - after).toBe(500n); // giá vip-30d — trừ đúng 1 lần, không 10 lần
  });

  it('2 request song song KHÁC key, ví chỉ đủ cho 1 → đúng 1 thành công, số dư không âm (docs/10 § Economy)', async () => {
    const userRepo = ds.getRepository(User);
    const poor = await userRepo.save(userRepo.create({ nickname: 'test-poor', avatarId: 'default-01', isGuest: false }));
    await economy.creditFromIap(poor.id, IapProvider.Google, { devTransactionId: `gpa-poor-${poor.id}` }, 'com.litmatch.diamond.550');
    // 550 diamond, giá vip-30d = 500 → chỉ 1 trong 2 lệnh mua được

    const results = await Promise.allSettled([
      economy.purchaseVip(poor.id, 'vip-30d', 'race-key-A'),
      economy.purchaseVip(poor.id, 'vip-30d', 'race-key-B'),
    ]);
    const ok = results.filter((r) => r.status === 'fulfilled');
    const failed = results.filter((r) => r.status === 'rejected');
    expect(ok.length).toBe(1);
    expect(failed.length).toBe(1);
    expect((failed[0] as PromiseRejectedResult).reason).toMatchObject({
      code: EconomyErrors.WALLET_INSUFFICIENT_BALANCE,
    });

    const wallet = await economy.getWallet(poor.id);
    expect(wallet.balance).toBe('50'); // 550 - 500, không âm
  });

  it('reversal: hoàn tiền bằng bút toán đảo, reverse lần 2 → 409, ledger gốc còn nguyên', async () => {
    const purchase = await economy.purchaseVip(userA, 'vip-30d', 'to-be-reversed');
    const before = BigInt((await economy.getWallet(userA)).balance);

    const reversed = await ledger.reverse(purchase.transactionId, 'reversal-key-1', 'test hoàn tiền lỗi hệ thống');
    expect(reversed.replayed).toBe(false);

    const after = BigInt((await economy.getWallet(userA)).balance);
    expect(after - before).toBe(500n);

    await expect(ledger.reverse(purchase.transactionId, 'reversal-key-2', 'reverse lần 2')).rejects.toMatchObject({
      code: EconomyErrors.TRANSACTION_ALREADY_REVERSED,
    });
    const original = await ds.getRepository(LedgerTransaction).findOneByOrFail({ id: purchase.transactionId });
    expect(original.status).toBe(TransactionStatus.Reversed);
  });

  it('trigger DB chặn UPDATE/DELETE ledger_entries — append-only không phụ thuộc kỷ luật code', async () => {
    await expect(ds.query(`UPDATE ledger_entries SET amount = 999999 WHERE true`)).rejects.toThrow(/append-only/);
    await expect(ds.query(`DELETE FROM ledger_entries WHERE true`)).rejects.toThrow(/append-only/);
  });

  it('đối soát: phát hiện snapshot bị sửa lệch, rebuildWallet khôi phục từ ledger', async () => {
    const stubConfig = { getOrThrow: () => true } as unknown as ConfigService;
    const recon = new ReconciliationService(ds, stubConfig, { addInterval: () => undefined } as unknown as SchedulerRegistry);

    expect((await recon.runOnce()).ok).toBe(true);

    // Giả lập bug làm lệch snapshot (bypass LedgerService)
    await ds.query(`UPDATE wallets SET balance = balance + 7777 WHERE user_id = $1`, [userA]);
    const dirty = await recon.runOnce();
    expect(dirty.ok).toBe(false);
    expect(dirty.walletMismatches.some((m) => m.userId === userA)).toBe(true);

    await ledger.rebuildWallet(userA);
    expect((await recon.runOnce()).ok).toBe(true);
  });

  it('lịch sử giao dịch: cursor pagination + diamondDelta đúng dấu', async () => {
    const page1 = await economy.listTransactions(userA, 2);
    expect(page1.data.length).toBe(2);
    expect(page1.meta.nextCursor).toBeTruthy();
    const page2 = await economy.listTransactions(userA, 2, page1.meta.nextCursor as string);
    expect(page2.data.map((t) => t.id)).not.toEqual(page1.data.map((t) => t.id));
    // giao dịch nạp phải có delta dương, mua VIP delta âm
    const all = [...page1.data, ...page2.data];
    expect(all.some((t) => BigInt(t.diamondDelta) > 0n)).toBe(true);
    expect(all.some((t) => BigInt(t.diamondDelta) < 0n)).toBe(true);
  });

  it('refund sau khi đã tiêu: balance âm đúng, tiêu tiếp bị chặn, nạp bù trừ nợ đúng (docs/services/economy-service.md § 5)', async () => {
    const userRepo = ds.getRepository(User);
    const user = await userRepo.save(userRepo.create({ nickname: 'test-refund', avatarId: 'default-01', isGuest: false }));

    // Nạp 1200, mua VIP giá 500 → còn 700
    const credit = await economy.creditFromIap(user.id, IapProvider.Google, { devTransactionId: 'refund-case-1' }, 'com.litmatch.diamond.1200');
    await economy.purchaseVip(user.id, 'vip-30d', 'refund-case-vip-1');
    expect((await economy.getWallet(user.id)).balance).toBe('700');

    // Không tìm thấy receipt → ack nhẹ nhàng, không throw (webhook không nên 500 vì unknown)
    const unknown = await refundService.refundIapPurchase(IapProvider.Google, 'khong-ton-tai', 'test');
    expect(unknown.outcome).toBe('unknown_receipt');

    // Apple/Google báo hoàn tiền giao dịch nạp gốc — SAU KHI user đã tiêu một phần
    const receipt = await ds.getRepository(IapReceipt).findOneByOrFail({ transactionId: credit.transactionId });
    const outcome = await refundService.refundIapPurchase(receipt.provider, receipt.providerTransactionId, 'test hoàn tiền store');
    expect(outcome.outcome).toBe('refunded');

    // balance = 700 (đã tiêu) - 1200 (bị đảo) = -500 → nợ diamond, KHÔNG bị clamp về 0
    const afterRefund = await economy.getWallet(user.id);
    expect(afterRefund.balance).toBe('-500');

    // Idempotent: refund lại đúng receipt đó không tạo thêm bút toán đảo thứ 2
    const replay = await refundService.refundIapPurchase(receipt.provider, receipt.providerTransactionId, 'retry webhook');
    expect(replay.outcome).toBe('already_refunded');
    expect((await economy.getWallet(user.id)).balance).toBe('-500');

    // Đang nợ → tiêu tiếp (mua VIP) phải bị chặn, không được đẩy nợ sâu thêm
    await expect(economy.purchaseVip(user.id, 'vip-30d', 'refund-case-vip-2')).rejects.toMatchObject({
      code: EconomyErrors.WALLET_INSUFFICIENT_BALANCE,
    });

    // Nạp bù 550 → tự động trừ nợ, không cần logic riêng (balance = tổng Có - tổng Nợ)
    await economy.creditFromIap(user.id, IapProvider.Google, { devTransactionId: 'refund-case-2' }, 'com.litmatch.diamond.550');
    expect((await economy.getWallet(user.id)).balance).toBe('50'); // -500 + 550

    // Bất biến toàn cục vẫn giữ nguyên sau toàn bộ chuỗi refund/nạp bù
    const recon = new ReconciliationService(
      ds,
      { getOrThrow: () => true } as unknown as ConfigService,
      { addInterval: () => undefined } as unknown as SchedulerRegistry,
    );
    expect((await recon.runOnce()).ok).toBe(true);
  });

  it('property: chuỗi giao dịch ngẫu nhiên (nạp/mua VIP/reverse) luôn giữ bất biến double-entry sau MỖI bước', async () => {
    const userRepo = ds.getRepository(User);
    const users = await Promise.all(
      Array.from({ length: 4 }, (_, i) =>
        userRepo.save(userRepo.create({ nickname: `prop-${i}`, avatarId: 'default-01', isGuest: false })),
      ),
    );
    const recon = new ReconciliationService(
      ds,
      { getOrThrow: () => true } as unknown as ConfigService,
      { addInterval: () => undefined } as unknown as SchedulerRegistry,
    );
    const products = ['com.litmatch.diamond.100', 'com.litmatch.diamond.550', 'com.litmatch.diamond.1200'];
    const reversibleTransactionIds: string[] = [];
    const alreadyReversed = new Set<string>();

    for (let step = 0; step < 60; step++) {
      const user = users[Math.floor(Math.random() * users.length)];
      const dice = Math.random();
      try {
        if (dice < 0.45) {
          const product = products[Math.floor(Math.random() * products.length)];
          const r = await economy.creditFromIap(user.id, IapProvider.Google, { devTransactionId: `prop-credit-${step}` }, product);
          reversibleTransactionIds.push(r.transactionId);
        } else if (dice < 0.8) {
          const r = await economy.purchaseVip(user.id, 'vip-30d', `prop-vip-${step}`);
          reversibleTransactionIds.push(r.transactionId);
        } else {
          const candidates = reversibleTransactionIds.filter((id) => !alreadyReversed.has(id));
          if (candidates.length > 0) {
            const target = candidates[Math.floor(Math.random() * candidates.length)];
            await ledger.reverse(target, `prop-rev-${step}`, 'property test reversal');
            alreadyReversed.add(target);
          }
        }
      } catch {
        // Không đủ số dư / đã reversed là KẾT QUẢ HỢP LỆ của chuỗi ngẫu nhiên — bỏ qua, bất biến
        // vẫn phải giữ nguyên vì toàn bộ nằm trong 1 DB transaction đã rollback khi lỗi.
      }

      // Bất biến double-entry phải giữ nguyên SAU MỌI BƯỚC, kể cả bước vừa reject.
      expect((await recon.runOnce()).ok).toBe(true);
    }
  });
});
