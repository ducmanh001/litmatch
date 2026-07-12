import {
  Injectable,
  Logger,
  OnApplicationBootstrap,
  OnApplicationShutdown,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { SchedulerRegistry } from '@nestjs/schedule';
import { InjectDataSource } from '@nestjs/typeorm';
import { DomainException } from '@litmatch/common-exceptions';
import { DataSource, LessThan } from 'typeorm';

import { callTickIdempotencyKey } from '../calling.constants';
import { CallingService } from '../calling.service';
import {
  CallEndReason,
  CallSession,
  CallSessionStatus,
} from '../entities/call-session.entity';
import { EconomyErrors, EconomyService, TransactionType } from '../../economy';

import type { CoreApiEnv } from '../../../config/env.validation';

const TICKER_JOB = 'calling-ticker';

/**
 * Timer + billing của call — TẤT CẢ enforce ở server, không tin timer client
 * (docs/10 § Calling; docs/services/calling-service.md § 4):
 * - pending quá CALLING_PENDING_TIMEOUT_SECONDS → end pending_timeout.
 * - active + price=0: quá CALLING_FREE_CALL_SECONDS → end free_limit (không đụng Economy).
 * - active + price>0: mỗi phút BẮT ĐẦU sau free window trừ diamond CẢ 2 bên, idempotency
 *   `calling:tick:{callId}:{userId}:{minute}` — unique DB trên Transaction là chốt chặn,
 *   2 ticker instance song song không trừ đôi. Thiếu tiền → end insufficient_balance.
 * - Race end-vs-tick: billing giữ lock call FOR UPDATE + re-check active TRONG transaction;
 *   endById cũng lock call → không bao giờ trừ tiền cho phút bắt đầu sau khi call đã end.
 * Stateless — chạy được nhiều instance (idempotency + lock là nguồn an toàn, không phải "chỉ 1 pod").
 */
@Injectable()
export class CallTickerService
  implements OnApplicationBootstrap, OnApplicationShutdown
{
  private readonly logger = new Logger(CallTickerService.name);
  private running = false;

  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly config: ConfigService<CoreApiEnv, true>,
    private readonly scheduler: SchedulerRegistry,
    private readonly callingService: CallingService,
    private readonly economy: EconomyService,
  ) {}

  onApplicationBootstrap(): void {
    const interval = setInterval(
      () =>
        void this.runOnce().catch((err) =>
          this.logger.error({ err: `${err}` }, 'Call ticker tick lỗi'),
        ),
      this.config.getOrThrow('CALLING_TICKER_INTERVAL_MS', { infer: true }),
    );
    this.scheduler.addInterval(TICKER_JOB, interval);
  }

  onApplicationShutdown(): void {
    if (this.scheduler.doesExist('interval', TICKER_JOB))
      this.scheduler.deleteInterval(TICKER_JOB);
  }

  /** 1 tick — public để test/chạy tay. */
  async runOnce(): Promise<void> {
    if (this.running) return; // tick trước chưa xong thì bỏ qua, không chồng
    this.running = true;
    try {
      await this.sweepPending();
      await this.processActiveCalls();
    } finally {
      this.running = false;
    }
  }

  private async sweepPending(): Promise<void> {
    const timeoutSeconds = this.config.getOrThrow(
      'CALLING_PENDING_TIMEOUT_SECONDS',
      { infer: true },
    );
    const cutoff = new Date(Date.now() - timeoutSeconds * 1000);
    const stale = await this.dataSource.getRepository(CallSession).find({
      where: { status: CallSessionStatus.Pending, createdAt: LessThan(cutoff) },
    });
    for (const call of stale) {
      await this.callingService.endById(call.id, CallEndReason.PendingTimeout);
    }
  }

  private async processActiveCalls(): Promise<void> {
    const active = await this.dataSource.getRepository(CallSession).find({
      where: { status: CallSessionStatus.Active },
    });
    for (const call of active) {
      await this.processActive(call.id).catch((err) =>
        this.logger.error(
          { err: `${err}` },
          `Xử lý call active ${call.id} lỗi — thử lại ở tick sau`,
        ),
      );
    }
  }

  private async processActive(callId: string): Promise<void> {
    const freeSeconds = this.config.getOrThrow('CALLING_FREE_CALL_SECONDS', {
      infer: true,
    });
    const price = this.config.getOrThrow('CALLING_PRICE_PER_MINUTE_DIAMOND', {
      infer: true,
    });

    if (price === 0) {
      // Free-only: hết free window thì server tự end (docs/06) — không đụng Economy
      const call = await this.dataSource
        .getRepository(CallSession)
        .findOneBy({ id: callId });
      if (
        call?.status === CallSessionStatus.Active &&
        call.startedAt &&
        Date.now() - call.startedAt.getTime() >= freeSeconds * 1000
      ) {
        await this.callingService.endById(callId, CallEndReason.FreeLimit);
      }
      return;
    }

    // Billing: giữ lock call suốt quá trình trừ tiền — chốt chặn race end-vs-tick (spec § 4)
    let insufficient = false;
    await this.dataSource.transaction(async (manager) => {
      const call = await manager.findOne(CallSession, {
        where: { id: callId },
        lock: { mode: 'pessimistic_write' },
      });
      if (!call || call.status !== CallSessionStatus.Active || !call.startedAt)
        return;

      const elapsedMs = Date.now() - call.startedAt.getTime();
      const billableMs = elapsedMs - freeSeconds * 1000;
      if (billableMs < 0) return; // còn trong free window
      // phút tính phí thứ k (1-based) BẮT ĐẦU tại free + (k-1)*60s — phút lẻ đã bắt đầu tính trọn (spec § 6)
      const currentMinute = Math.floor(billableMs / 60_000) + 1;
      if (call.billedMinutes >= currentMinute) return; // đã trừ đủ tới phút hiện tại

      for (
        let minute = call.billedMinutes + 1;
        minute <= currentMinute;
        minute++
      ) {
        for (const userId of [call.userAId, call.userBId]) {
          try {
            // spendDiamond tự transaction + lock ví + idempotent; crash giữa chừng → tick sau
            // replay cùng key, không trừ đôi (unique DB trên Transaction)
            await this.economy.spendDiamond(
              userId,
              TransactionType.CallingPerMinute,
              price,
              callTickIdempotencyKey(call.id, userId, minute),
              { callId: call.id, minute },
            );
          } catch (err) {
            if (
              err instanceof DomainException &&
              err.code === EconomyErrors.WALLET_INSUFFICIENT_BALANCE
            ) {
              insufficient = true;
              break;
            }
            throw err;
          }
        }
        if (insufficient) break;
        call.billedMinutes = minute;
        await manager.save(call);
      }
    });

    if (insufficient) {
      // end NGOÀI transaction billing (endById tự lock lại) — phút đã trừ không hoàn (spec § 6)
      await this.callingService.endById(
        callId,
        CallEndReason.InsufficientBalance,
      );
    }
  }
}
