import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';

import { UserModule } from '../user';

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
import {
  AppleNotificationVerifier,
  DevAppleNotificationVerifier,
  DevGoogleRtdnVerifier,
  GoogleRtdnVerifier,
  StoreAppleNotificationVerifier,
  StoreGoogleRtdnVerifier,
} from './services/notification-verifier';
import { IapRefundPollService } from './services/iap-refund-poll.service';
import { OutboxRelayService } from './services/outbox-relay.service';
import { ReconciliationService } from './services/reconciliation.service';
import { RefundService } from './services/refund.service';
import { EconomyWebhooksController } from './webhooks/economy-webhooks.controller';

@Module({
  imports: [
    UserModule,
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
    {
      provide: IapVerifier,
      inject: [ConfigService],
      useFactory: (config: ConfigService): IapVerifier =>
        config.getOrThrow<string>('ECONOMY_IAP_VERIFIER') === 'store'
          ? new StoreIapVerifier(config)
          : new DevIapVerifier(config),
    },
    {
      provide: AppleNotificationVerifier,
      inject: [ConfigService],
      useFactory: (config: ConfigService): AppleNotificationVerifier =>
        config.getOrThrow<string>('ECONOMY_APPLE_WEBHOOK_VERIFIER') === 'store'
          ? new StoreAppleNotificationVerifier(config)
          : new DevAppleNotificationVerifier(config),
    },
    {
      provide: GoogleRtdnVerifier,
      inject: [ConfigService],
      useFactory: (config: ConfigService): GoogleRtdnVerifier =>
        config.getOrThrow<string>('ECONOMY_GOOGLE_RTDN_VERIFIER') === 'store'
          ? new StoreGoogleRtdnVerifier(config)
          : new DevGoogleRtdnVerifier(config),
    },
  ],
  exports: [EconomyService],
})
export class EconomyModule {}
