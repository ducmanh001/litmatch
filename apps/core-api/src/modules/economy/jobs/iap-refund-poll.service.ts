import {
  HttpStatus,
  Injectable,
  Logger,
  OnApplicationBootstrap,
  OnApplicationShutdown,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { SchedulerRegistry } from '@nestjs/schedule';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';

import { ManagedInterval } from '../../../common/scheduling/managed-interval';
import type { CoreApiEnv } from '../../../config/env.validation';
import {
  ANDROID_PUBLISHER_API_BASE,
  ANDROID_PUBLISHER_SCOPE,
} from '../economy.constants';
import {
  IapProvider,
  IapReceipt,
  IapReceiptStatus,
} from '../entities/iap.entities';
import {
  appleServerApiBaseUrl,
  getAppleServerApiToken,
} from '../clients/apple-server-api';
import { getGoogleServiceAccountAccessToken } from '../clients/google-service-account';
import { storeApiAbortSignal } from '../clients/store-api-http';
import { RefundService } from '../services/refund.service';

const JOB = 'economy-iap-refund-poll';
/** Batch vận hành nội bộ mỗi tick — không phải rule nghiệp vụ (cùng phong cách SESSION_SWEEP_BATCH). */
const REFUND_POLL_BATCH = 200;
/** maxResults tối đa của Google Voided Purchases API. */
const VOIDED_PURCHASES_PAGE_SIZE = 1000;

interface RefundPollReport {
  checked: number;
  refunded: number;
}

/**
 * Backstop cho webhook bị miss (docs/services/economy-service.md § 5) — webhook không đảm bảo
 * 100% (network drop, downtime, Pub/Sub push lỗi cấu hình...). Quét định kỳ:
 * - Apple: "Get Refund History" — CHỈ có API tra theo từng transaction, không có API liệt kê
 *   toàn bộ refund gần đây, nên phải gọi từng receipt Apple còn `credited` trong window.
 * - Google: "Voided Purchases" — liệt kê 1 lần/run toàn bộ purchase bị void trong window, đối
 *   chiếu tại chỗ với các receipt Google còn `credited` (rẻ hơn Apple rất nhiều).
 *
 * Nhiều instance `core-api` chạy job này song song (docs § 3.4 — vẫn modular monolith nhưng
 * scale ngang nhiều pod): claim 1 lô bằng `FOR UPDATE SKIP LOCKED` (không dẫm receipt của nhau)
 * rồi COMMIT ngay để nhả lock TRƯỚC KHI gọi API bên ngoài/refund — nếu giữ lock xuyên suốt gọi
 * `RefundService.refundIapPurchase()` (mở transaction RIÊNG, connection khác) sẽ tự deadlock với
 * chính UPDATE `iap_receipts.status` lồng bên trong nó.
 */
@Injectable()
export class IapRefundPollService
  implements OnApplicationBootstrap, OnApplicationShutdown
{
  private readonly logger = new Logger(IapRefundPollService.name);
  private readonly job = new ManagedInterval();

  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly refundService: RefundService,
    private readonly config: ConfigService<CoreApiEnv, true>,
    private readonly scheduler: SchedulerRegistry,
  ) {}

  onApplicationBootstrap(): void {
    if (!this.config.getOrThrow('ECONOMY_REFUND_POLL_ENABLED', { infer: true }))
      return;
    this.job.start(this.scheduler, {
      jobName: JOB,
      intervalMs: this.config.getOrThrow('ECONOMY_REFUND_POLL_INTERVAL_MS', {
        infer: true,
      }),
      task: () => this.runOnce(),
      logger: this.logger,
      errorMessage: 'Refund poll job lỗi',
    });
  }

  onApplicationShutdown(): void {
    this.job.stop();
  }

  async runOnce(batchSize = REFUND_POLL_BATCH): Promise<RefundPollReport> {
    const windowDays = this.config.getOrThrow(
      'ECONOMY_REFUND_POLL_WINDOW_DAYS',
      { infer: true },
    );
    const since = new Date(Date.now() - windowDays * 24 * 3600 * 1000);

    // Claim nhanh 1 lô rồi stamp watermark + COMMIT NGAY (nhả lock) trước khi làm bất cứ việc gì
    // chậm/ra ngoài — order theo refund_checked_at (NULLS FIRST) để mỗi run tiến sang receipt
    // khác, không đứng yên ở cùng lô cũ nhất mãi mãi (receipt không refund thì trạng thái
    // 'credited' không đổi nên không tự "rớt" khỏi lô nếu không có watermark riêng).
    const candidates = await this.dataSource.transaction(async (manager) => {
      const claimed = await manager
        .getRepository(IapReceipt)
        .createQueryBuilder('r')
        .setLock('pessimistic_write')
        .setOnLocked('skip_locked')
        .where('r.status = :status', { status: IapReceiptStatus.Credited })
        .andWhere('r.created_at > :since', { since })
        .orderBy('r.refund_checked_at', 'ASC', 'NULLS FIRST')
        .limit(batchSize)
        .getMany();
      if (claimed.length > 0) {
        await manager.update(
          IapReceipt,
          claimed.map((c) => c.id),
          { refundCheckedAt: new Date() },
        );
      }
      return claimed;
    });

    if (candidates.length === batchSize) {
      this.logger.warn(
        `Refund poll: batch đầy (${batchSize}) — có thể còn receipt chưa được quét trong window này`,
      );
    }

    const refundedApple = await this.pollApple(
      candidates.filter((r) => r.provider === IapProvider.Apple),
    );
    const refundedGoogle = await this.pollGoogle(
      candidates.filter((r) => r.provider === IapProvider.Google),
      since,
    );

    return {
      checked: candidates.length,
      refunded: refundedApple + refundedGoogle,
    };
  }

  private async pollApple(receipts: IapReceipt[]): Promise<number> {
    let refunded = 0;
    for (const receipt of receipts) {
      if (await this.appleHasRefundRecord(receipt.providerTransactionId)) {
        await this.refundService.refundIapPurchase(
          IapProvider.Apple,
          receipt.providerTransactionId,
          'apple:poll:refund-history',
        );
        refunded += 1;
      }
    }
    return refunded;
  }

  private async appleHasRefundRecord(
    originalTransactionId: string,
  ): Promise<boolean> {
    const token = await getAppleServerApiToken(this.config);
    const url = `${appleServerApiBaseUrl(this.config)}/inApps/v2/refund/lookup/${encodeURIComponent(originalTransactionId)}`;
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${token}` },
      signal: storeApiAbortSignal(this.config),
    });
    if (res.status === HttpStatus.NOT_FOUND) return false; // Apple trả 404 khi chưa từng có refund cho transaction này
    if (!res.ok) {
      this.logger.warn(
        `Apple Get Refund History lỗi ${res.status} cho ${originalTransactionId}`,
      );
      return false;
    }
    const body = (await res.json()) as { signedTransactions?: string[] };
    return (body.signedTransactions?.length ?? 0) > 0;
  }

  private async pollGoogle(
    receipts: IapReceipt[],
    since: Date,
  ): Promise<number> {
    if (receipts.length === 0) return 0;
    const packageName = this.config.getOrThrow('ECONOMY_GOOGLE_PACKAGE_NAME', {
      infer: true,
    });
    const accessToken = await getGoogleServiceAccountAccessToken(
      this.config,
      ANDROID_PUBLISHER_SCOPE,
    );
    const url = `${ANDROID_PUBLISHER_API_BASE}/applications/${encodeURIComponent(packageName)}/purchases/voidedpurchases?startTime=${since.getTime()}&maxResults=${VOIDED_PURCHASES_PAGE_SIZE}`;
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${accessToken}` },
      signal: storeApiAbortSignal(this.config),
    });
    if (!res.ok) {
      this.logger.warn(`Google Voided Purchases API lỗi ${res.status}`);
      return 0;
    }
    const body = (await res.json()) as {
      voidedPurchases?: Array<{ orderId: string }>;
    };
    const voidedOrderIds = new Set(
      (body.voidedPurchases ?? []).map((v) => v.orderId),
    );

    let refunded = 0;
    for (const receipt of receipts) {
      if (voidedOrderIds.has(receipt.providerTransactionId)) {
        await this.refundService.refundIapPurchase(
          IapProvider.Google,
          receipt.providerTransactionId,
          'google:poll:voided-purchases',
        );
        refunded += 1;
      }
    }
    return refunded;
  }
}
