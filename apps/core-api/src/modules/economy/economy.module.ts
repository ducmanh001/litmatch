import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';

import { EconomyController } from './economy.controller';
import { EconomyService } from './economy.service';
import { LedgerService } from './ledger.service';
import { LedgerAccount } from './entities/ledger-account.entity';
import { LedgerEntry } from './entities/ledger-entry.entity';
import { OutboxEvent } from './entities/outbox-event.entity';
import { LedgerTransaction } from './entities/transaction.entity';
import { Wallet } from './entities/wallet.entity';
import { IapProduct, IapReceipt } from './entities/iap.entities';
import { VipPlan } from './entities/vip-plan.entity';
import { DevIapVerifier, IapVerifier, StoreIapVerifier } from './services/iap-verifier';
import { OutboxRelayService } from './services/outbox-relay.service';
import { ReconciliationService } from './services/reconciliation.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      LedgerAccount,
      LedgerTransaction,
      LedgerEntry,
      Wallet,
      IapProduct,
      IapReceipt,
      VipPlan,
      OutboxEvent,
    ]),
  ],
  controllers: [EconomyController],
  providers: [
    EconomyService,
    LedgerService, // writer duy nhất của ledger — KHÔNG export ra ngoài module
    OutboxRelayService,
    ReconciliationService,
    DevIapVerifier,
    StoreIapVerifier,
    {
      provide: IapVerifier,
      inject: [ConfigService, DevIapVerifier, StoreIapVerifier],
      useFactory: (config: ConfigService, dev: DevIapVerifier, store: StoreIapVerifier) =>
        config.getOrThrow<string>('ECONOMY_IAP_VERIFIER') === 'store' ? store : dev,
    },
  ],
  exports: [EconomyService],
})
export class EconomyModule {}
