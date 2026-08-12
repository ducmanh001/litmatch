import {
  IapProvider,
  IapReceipt,
  IapReceiptStatus,
} from '../entities/iap.entities';
import { IapRefundPollService } from './iap-refund-poll.service';
import {
  AppleRefundGateway,
  GoogleVoidedPurchasesGateway,
} from '../ports/refund-gateways';
import { RefundService } from '../services/refund.service';

import type { ConfigService } from '@nestjs/config';
import type { SchedulerRegistry } from '@nestjs/schedule';
import type { DataSource } from 'typeorm';
import type { CoreApiEnv } from '../../../config/env.validation';

function stubConfig(
  overrides: Partial<CoreApiEnv> = {},
): ConfigService<CoreApiEnv, true> {
  const values: Partial<CoreApiEnv> = {
    ECONOMY_REFUND_POLL_ENABLED: false,
    ECONOMY_REFUND_POLL_INTERVAL_MS: 1_000,
    ECONOMY_REFUND_POLL_WINDOW_DAYS: 30,
    ...overrides,
  };
  return {
    getOrThrow: jest.fn((key: keyof CoreApiEnv) => values[key]),
  } as unknown as ConfigService<CoreApiEnv, true>;
}

function stubScheduler() {
  const intervals = new Map<string, NodeJS.Timeout>();
  const addInterval = jest.fn((name: string, interval: NodeJS.Timeout) => {
    intervals.set(name, interval);
  });
  const doesExist = jest.fn((_type: string, name: string) =>
    intervals.has(name),
  );
  const deleteInterval = jest.fn((name: string) => {
    clearInterval(intervals.get(name));
    intervals.delete(name);
  });
  return {
    intervals,
    scheduler: {
      addInterval,
      doesExist,
      deleteInterval,
    } as unknown as SchedulerRegistry,
  };
}

function receipt(
  provider: IapProvider,
  providerTransactionId: string,
): IapReceipt {
  return {
    id: `${provider}-${providerTransactionId}`,
    provider,
    providerTransactionId,
    status: IapReceiptStatus.Credited,
  } as IapReceipt;
}

function makeService(claimed: IapReceipt[], config = stubConfig()) {
  const queryBuilder = {
    setLock: jest.fn().mockReturnThis(),
    setOnLocked: jest.fn().mockReturnThis(),
    where: jest.fn().mockReturnThis(),
    andWhere: jest.fn().mockReturnThis(),
    orderBy: jest.fn().mockReturnThis(),
    limit: jest.fn().mockReturnThis(),
    getMany: jest.fn().mockResolvedValue(claimed),
  };
  const manager = {
    getRepository: jest.fn(() => ({
      createQueryBuilder: jest.fn(() => queryBuilder),
    })),
    update: jest.fn().mockResolvedValue(undefined),
  };
  const dataSource = {
    transaction: jest.fn(async (callback: (value: typeof manager) => unknown) =>
      callback(manager),
    ),
  } as unknown as DataSource;
  const refundService = {
    refundIapPurchase: jest.fn().mockResolvedValue({ outcome: 'refunded' }),
  } as unknown as RefundService;
  const appleRefund = {
    hasRefund: jest.fn(),
  } as unknown as AppleRefundGateway;
  const googleRefund = {
    findVoidedPurchaseIds: jest.fn(),
  } as unknown as GoogleVoidedPurchasesGateway;
  const { scheduler } = stubScheduler();
  const service = new IapRefundPollService(
    dataSource,
    refundService,
    appleRefund,
    googleRefund,
    config,
    scheduler,
  );

  return {
    service,
    dataSource,
    manager,
    queryBuilder,
    refundService,
    appleRefund,
    googleRefund,
    scheduler,
  };
}

describe('IapRefundPollService', () => {
  afterEach(() => jest.useRealTimers());

  it('không đăng ký interval khi feature bị tắt và shutdown an toàn', () => {
    const { service, scheduler } = makeService([]);

    service.onApplicationBootstrap();

    expect(scheduler.addInterval).not.toHaveBeenCalled();
    expect(() => service.onApplicationShutdown()).not.toThrow();
  });

  it('đăng ký job và chạy được task định kỳ khi feature bật', async () => {
    jest.useFakeTimers();
    const { service, scheduler, dataSource } = makeService(
      [],
      stubConfig({ ECONOMY_REFUND_POLL_ENABLED: true }),
    );

    service.onApplicationBootstrap();
    await jest.advanceTimersByTimeAsync(1_000);

    expect(scheduler.doesExist('interval', 'economy-iap-refund-poll')).toBe(
      true,
    );
    expect(dataSource.transaction).toHaveBeenCalledTimes(1);

    service.onApplicationShutdown();
    expect(scheduler.doesExist('interval', 'economy-iap-refund-poll')).toBe(
      false,
    );
  });

  it('claim đủ batch, stamp watermark và xử lý đúng Apple/Google hit-miss', async () => {
    const receipts = [
      receipt(IapProvider.Apple, 'apple-refunded'),
      receipt(IapProvider.Apple, 'apple-not-refunded'),
      receipt(IapProvider.Google, 'google-voided'),
      receipt(IapProvider.Google, 'google-not-voided'),
    ];
    const {
      service,
      manager,
      queryBuilder,
      refundService,
      appleRefund,
      googleRefund,
    } = makeService(
      receipts,
      stubConfig({ ECONOMY_REFUND_POLL_WINDOW_DAYS: 7 }),
    );
    (appleRefund.hasRefund as jest.Mock)
      .mockResolvedValueOnce(true)
      .mockResolvedValueOnce(false);
    (googleRefund.findVoidedPurchaseIds as jest.Mock).mockResolvedValue(
      new Set(['google-voided']),
    );

    const report = await service.runOnce(receipts.length);

    expect(report).toEqual({ checked: 4, refunded: 2 });
    expect(queryBuilder.setLock).toHaveBeenCalledWith('pessimistic_write');
    expect(queryBuilder.setOnLocked).toHaveBeenCalledWith('skip_locked');
    expect(queryBuilder.where).toHaveBeenCalledWith('r.status = :status', {
      status: IapReceiptStatus.Credited,
    });
    expect(queryBuilder.limit).toHaveBeenCalledWith(4);
    expect(manager.update).toHaveBeenCalledWith(
      IapReceipt,
      receipts.map((item) => item.id),
      { refundCheckedAt: expect.any(Date) },
    );
    expect(appleRefund.hasRefund).toHaveBeenCalledWith('apple-refunded');
    expect(appleRefund.hasRefund).toHaveBeenCalledWith('apple-not-refunded');
    expect(googleRefund.findVoidedPurchaseIds).toHaveBeenCalledWith(
      expect.any(Date),
    );
    expect(refundService.refundIapPurchase).toHaveBeenNthCalledWith(
      1,
      IapProvider.Apple,
      'apple-refunded',
      'apple:poll:refund-history',
    );
    expect(refundService.refundIapPurchase).toHaveBeenNthCalledWith(
      2,
      IapProvider.Google,
      'google-voided',
      'google:poll:voided-purchases',
    );
  });

  it('không update khi không có receipt và bỏ qua Google khi không có candidate', async () => {
    const { service, manager, refundService, appleRefund, googleRefund } =
      makeService([]);

    await expect(service.runOnce()).resolves.toEqual({
      checked: 0,
      refunded: 0,
    });

    expect(manager.update).not.toHaveBeenCalled();
    expect(appleRefund.hasRefund).not.toHaveBeenCalled();
    expect(googleRefund.findVoidedPurchaseIds).not.toHaveBeenCalled();
    expect(refundService.refundIapPurchase).not.toHaveBeenCalled();
  });
});
