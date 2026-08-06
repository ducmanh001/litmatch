import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';

import type { CoreApiEnv } from '../../config/env.validation';
import { EconomyController } from './economy.controller';
import { EconomyMetrics } from './economy.metrics';
import { EconomyService } from './economy.service';
import { LedgerService } from './services/ledger.service';
import { LedgerAccount } from './entities/ledger-account.entity';
import { LedgerEntry } from './entities/ledger-entry.entity';
import { OutboxEvent } from './entities/outbox-event.entity';
import { LedgerTransaction } from './entities/transaction.entity';
import { Wallet } from './entities/wallet.entity';
import { IapProduct, IapReceipt } from './entities/iap.entities';
import { PayosPackage, PayosPaymentOrder } from './entities/payos.entities';
import { VipPlan } from './entities/vip-plan.entity';
import {
  DisabledIapVerifier,
  DevIapVerifier,
  IapVerifier,
} from './ports/iap-verifier';
import { StoreIapVerifierAdapter } from './clients/store-iap-verifier.adapter';
import { AppleReceiptApiAdapter } from './clients/apple-receipt-api.adapter';
import { GooglePlayReceiptApiAdapter } from './clients/google-play-receipt-api.adapter';
import { AppleRefundApiAdapter } from './clients/apple-refund-api.adapter';
import { GoogleRefundApiAdapter } from './clients/google-refund-api.adapter';
import {
  AppleReceiptGateway,
  GooglePlayReceiptGateway,
} from './ports/store-payment-gateways';
import {
  AppleRefundGateway,
  GoogleVoidedPurchasesGateway,
} from './ports/refund-gateways';
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
import { PayosService } from './services/payos.service';
import { PayosClient, PayosHttpClientAdapter } from './ports/payos-client';
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
      PayosPackage,
      PayosPaymentOrder,
      VipPlan,
      OutboxEvent,
    ]),
  ],
  controllers: [EconomyController, EconomyWebhooksController],
  providers: [
    EconomyService,
    EconomyMetrics,
    LedgerService, // writer duy nhất của ledger — KHÔNG export ra ngoài module
    RefundService,
    PayosService,
    PayosHttpClientAdapter,
    { provide: PayosClient, useExisting: PayosHttpClientAdapter },
    OutboxRelayService,
    ReconciliationService,
    IapRefundPollService,
    DevIapVerifier,
    DisabledIapVerifier,
    StoreIapVerifierAdapter,
    AppleReceiptApiAdapter,
    GooglePlayReceiptApiAdapter,
    { provide: AppleReceiptGateway, useExisting: AppleReceiptApiAdapter },
    {
      provide: GooglePlayReceiptGateway,
      useExisting: GooglePlayReceiptApiAdapter,
    },
    AppleRefundApiAdapter,
    GoogleRefundApiAdapter,
    { provide: AppleRefundGateway, useExisting: AppleRefundApiAdapter },
    {
      provide: GoogleVoidedPurchasesGateway,
      useExisting: GoogleRefundApiAdapter,
    },
    {
      provide: IapVerifier,
      inject: [
        ConfigService,
        DevIapVerifier,
        StoreIapVerifierAdapter,
        DisabledIapVerifier,
      ],
      useFactory: (
        config: ConfigService<CoreApiEnv, true>,
        dev: DevIapVerifier,
        store: StoreIapVerifierAdapter,
        disabled: DisabledIapVerifier,
      ) => {
        const provider = config.getOrThrow('ECONOMY_IAP_VERIFIER', {
          infer: true,
        });
        if (provider === 'store') return store;
        if (provider === 'disabled') return disabled;
        return dev;
      },
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
