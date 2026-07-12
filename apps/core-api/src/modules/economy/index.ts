/**
 * Public API của Economy module — module khác CHỈ import từ đây.
 * LedgerService KHÔNG được export: mọi thao tác tiền đi qua EconomyService
 * (docs/services/economy-service.md § 3 — writer duy nhất).
 */
export { EconomyModule } from './economy.module';
export { EconomyService } from './economy.service';
export type { WalletView, TransactionView } from './economy.service';
export { VipTier } from './entities/wallet.entity';
export { IapProvider } from './entities/iap.entities';
export { TransactionType } from './entities/transaction.entity';
// Calling bắt WALLET_INSUFFICIENT_BALANCE để end call thay vì nổ lỗi (docs/services/calling-service.md § 4)
export { EconomyErrors } from './economy.errors';
