import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';

import type { CoreApiEnv } from '../../config/env.validation';
import { EconomyController } from './economy.controller';
import { EconomyService } from './economy.service';
import { LedgerService } from './services/ledger.service';
import { LedgerAccount } from './entities/ledger-account.entity';
import { LedgerEntry } from './entities/ledger-entry.entity';
import { OutboxEvent } from './entities/outbox-event.entity';
import { LedgerTransaction } from './entities/transaction.entity';
import { Wallet } from './entities/wallet.entity';
import { IapProduct, IapReceipt } from './entities/iap.entities';
import { VipPlan } from './entities/vip-plan.entity';
import {
  DevIapVerifier,
  IapVerifier,
  StoreIapVerifier,
} from './ports/iap-verifier';
import {
  AppleNotificationVerifier,
  DevAppleNotificationVerifier,
  DevGoogleRtdnVerifier,
  GoogleRtdnVerifier,
  StoreAppleNotificationVerifier,
  StoreGoogleRtdnVerifier,
} from './ports/notification-verifier';
import { IapRefundPollService } from './jobs/iap-refund-poll.service';
import { OutboxRelayService } from './jobs/outbox-relay.service';
import { ReconciliationService } from './jobs/reconciliation.service';
import { RefundService } from './services/refund.service';
import { EconomyWebhooksController } from './webhooks/economy-webhooks.controller';

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
  controllers: [EconomyController, EconomyWebhooksController],
  providers: [
    EconomyService,
    LedgerService, // writer duy nhất của ledger — KHÔNG export ra ngoài module
    RefundService,
    OutboxRelayService,
    ReconciliationService,
    IapRefundPollService,
    DevIapVerifier,
    StoreIapVerifier,
    {
      provide: IapVerifier,
      inject: [ConfigService, DevIapVerifier, StoreIapVerifier],
      useFactory: (
        config: ConfigService<CoreApiEnv, true>,
        dev: DevIapVerifier,
        store: StoreIapVerifier,
      ) =>
        config.getOrThrow('ECONOMY_IAP_VERIFIER', { infer: true }) === 'store'
          ? store
          : dev,
    },
    DevAppleNotificationVerifier,
    StoreAppleNotificationVerifier,
    {
      provide: AppleNotificationVerifier,
      inject: [
        ConfigService,
        DevAppleNotificationVerifier,
        StoreAppleNotificationVerifier,
      ],
      useFactory: (
        config: ConfigService<CoreApiEnv, true>,
        dev: DevAppleNotificationVerifier,
        store: StoreAppleNotificationVerifier,
      ) =>
        config.getOrThrow('ECONOMY_APPLE_WEBHOOK_VERIFIER', { infer: true }) ===
        'store'
          ? store
          : dev,
    },
    DevGoogleRtdnVerifier,
    StoreGoogleRtdnVerifier,
    {
      provide: GoogleRtdnVerifier,
      inject: [ConfigService, DevGoogleRtdnVerifier, StoreGoogleRtdnVerifier],
      useFactory: (
        config: ConfigService<CoreApiEnv, true>,
        dev: DevGoogleRtdnVerifier,
        store: StoreGoogleRtdnVerifier,
      ) =>
        config.getOrThrow('ECONOMY_GOOGLE_RTDN_VERIFIER', { infer: true }) ===
        'store'
          ? store
          : dev,
    },
  ],
  exports: [EconomyService],
})
export class EconomyModule {}
