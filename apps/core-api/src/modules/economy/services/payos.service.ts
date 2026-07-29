import { createHash } from 'node:crypto';

import { HttpStatus, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { DomainException } from '@litmatch/common-exceptions';
import { EntityManager, IsNull, Repository } from 'typeorm';

import type { CoreApiEnv } from '../../../config/env.validation';
import {
  isUniqueViolation,
  violatedConstraint,
} from '../../../database/postgres-errors';
import {
  PAYOS_CURRENCY_VND,
  PAYOS_SUCCESS_CODE,
  UQ_PAYOS_ORDER_IDEMPOTENCY_KEY,
} from '../economy.constants';
import { EconomyErrors } from '../economy.errors';
import {
  PayosPackage,
  PayosPaymentOrder,
  PayosPaymentOrderStatus,
} from '../entities/payos.entities';
import {
  LedgerAccountKind,
  LedgerCurrency,
} from '../entities/ledger-account.entity';
import { LedgerDirection } from '../entities/ledger-entry.entity';
import { TransactionType } from '../entities/transaction.entity';
import { PayosClient, PayosWebhookEvent } from '../ports/payos-client';
import { LedgerService } from './ledger.service';

export interface PayosOrderView {
  orderId: string;
  orderCode: string;
  amountVnd: string;
  diamonds: string;
  status: PayosPaymentOrderStatus;
  checkoutUrl: string | null;
  qrCode: string | null;
  expiresAt: Date;
  replayed: boolean;
}

export interface PayosPackageView {
  packageId: string;
  amountVnd: string;
  diamonds: string;
}

@Injectable()
export class PayosService {
  constructor(
    @InjectRepository(PayosPackage)
    private readonly packageRepo: Repository<PayosPackage>,
    @InjectRepository(PayosPaymentOrder)
    private readonly orderRepo: Repository<PayosPaymentOrder>,
    private readonly ledger: LedgerService,
    private readonly client: PayosClient,
    private readonly config: ConfigService<CoreApiEnv, true>,
  ) {}

  async listPackages(): Promise<PayosPackageView[]> {
    const packages = await this.packageRepo.find({
      where: { active: true },
      order: { amountVnd: 'ASC' },
    });
    return packages.map((pkg) => ({
      packageId: pkg.packageId,
      amountVnd: pkg.amountVnd,
      diamonds: pkg.diamonds,
    }));
  }

  async createOrder(
    userId: string,
    packageId: string,
    clientIdempotencyKey: string,
  ): Promise<PayosOrderView> {
    const idempotencyKey = `payos:${userId}:${clientIdempotencyKey}`;
    const requestHash = createHash('sha256').update(packageId).digest('hex');
    let order = await this.orderRepo.findOneBy({ idempotencyKey });
    let replayed = Boolean(order);
    if (order) {
      this.assertSameCreateRequest(order, requestHash);
    } else {
      const pkg = await this.packageRepo.findOneBy({ packageId, active: true });
      if (!pkg) {
        throw new DomainException(
          EconomyErrors.PAYOS_PACKAGE_UNKNOWN,
          'Gói nạp payOS không tồn tại hoặc đã ngừng bán',
          HttpStatus.NOT_FOUND,
        );
      }
      const expiresAt = new Date(
        Date.now() +
          this.config.getOrThrow('PAYOS_ORDER_EXPIRES_SECONDS', {
            infer: true,
          }) *
            1000,
      );
      try {
        order = await this.orderRepo.save(
          this.orderRepo.create({
            userId,
            packageId: pkg.packageId,
            amountVnd: pkg.amountVnd,
            diamonds: pkg.diamonds,
            currency: PAYOS_CURRENCY_VND,
            idempotencyKey,
            requestHash,
            expiresAt,
          }),
        );
      } catch (err) {
        if (
          !isUniqueViolation(err) ||
          !violatedConstraint(err, UQ_PAYOS_ORDER_IDEMPOTENCY_KEY)
        ) {
          throw err;
        }
        order = await this.orderRepo.findOneByOrFail({ idempotencyKey });
        this.assertSameCreateRequest(order, requestHash);
        replayed = true;
      }
    }
    const resolved = await this.ensureCheckoutLink(order);
    return this.toOrderView(resolved, replayed);
  }

  async getOrderStatus(
    userId: string,
    orderId: string,
  ): Promise<{
    orderId: string;
    status: PayosPaymentOrderStatus;
    transactionId: string | null;
    diamonds: string;
  }> {
    let order = await this.orderRepo.findOneBy({ id: orderId, userId });
    if (!order) this.throwOrderNotFound();
    if (
      order.status === PayosPaymentOrderStatus.Pending &&
      order.expiresAt <= new Date()
    ) {
      await this.orderRepo.update(
        {
          id: order.id,
          userId,
          status: PayosPaymentOrderStatus.Pending,
        },
        { status: PayosPaymentOrderStatus.Expired },
      );
      order = await this.orderRepo.findOneByOrFail({ id: order.id, userId });
    }
    return {
      orderId: order.id,
      status: order.status,
      transactionId: order.transactionId,
      diamonds: order.diamonds,
    };
  }

  /** Chỉ caller webhook đã HMAC-verify mới được gọi write path này. */
  async creditVerifiedWebhook(event: PayosWebhookEvent): Promise<boolean> {
    const order = await this.orderRepo.findOneBy({
      orderCode: event.orderCode,
    });
    if (!order || !this.matchesPaidOrder(order, event)) return false;
    try {
      const result = await this.ledger.record({
        type: TransactionType.PayosTopup,
        idempotencyKey: `payos-credit:${order.orderCode}`,
        actorUserId: order.userId,
        metadata: {
          provider: 'payos',
          orderId: order.id,
          orderCode: order.orderCode,
          packageId: order.packageId,
          amountVnd: order.amountVnd,
          diamonds: order.diamonds,
          paymentLinkId: order.paymentLinkId,
        },
        entries: [
          {
            accountKind: LedgerAccountKind.SystemIap,
            direction: LedgerDirection.Debit,
            amount: BigInt(order.diamonds),
            currency: LedgerCurrency.Diamond,
          },
          {
            accountKind: LedgerAccountKind.UserWallet,
            userId: order.userId,
            direction: LedgerDirection.Credit,
            amount: BigInt(order.diamonds),
            currency: LedgerCurrency.Diamond,
          },
        ],
        withinTransaction: async (manager, txn) => {
          const locked = await this.lockOrder(manager, order.id);
          if (!this.matchesPaidOrder(locked, event))
            this.throwWebhookMismatch();
          await manager.update(
            PayosPaymentOrder,
            // Row đã FOR UPDATE; webhook hợp lệ đến trễ sau khi read-path derive `expired`
            // vẫn phải gắn order↔ledger atomically, không để ví đã credit nhưng order còn expired.
            { id: locked.id },
            {
              status: PayosPaymentOrderStatus.Paid,
              transactionId: txn.id,
            },
          );
        },
      });
      return !result.replayed;
    } catch (err) {
      if (
        err instanceof DomainException &&
        err.code === EconomyErrors.PAYOS_WEBHOOK_MISMATCH
      ) {
        return false;
      }
      throw err;
    }
  }

  private async ensureCheckoutLink(
    order: PayosPaymentOrder,
  ): Promise<PayosPaymentOrder> {
    if (order.checkoutUrl && order.paymentLinkId) return order;

    // Không giữ connection/row lock trong lúc gọi dependency. Những request đồng thời dùng
    // cùng orderCode; payOS trả link hiện hữu và client còn GET-recover khi POST bị trùng/timeout.
    const link = await this.client.createPaymentLink({
      orderCode: order.orderCode,
      amountVnd: order.amountVnd,
      // Merchant chưa liên kết qua payOS bị giới hạn description tối đa 9 ký tự.
      description: `LM${order.orderCode.slice(-7)}`,
      returnUrl: this.redirectUrl('PAYOS_RETURN_URL', order.id),
      cancelUrl: this.redirectUrl('PAYOS_CANCEL_URL', order.id),
      expiresAt: order.expiresAt,
    });

    // First writer wins. Retry/race chỉ đọc lại canonical row, không ghi đè link đã lưu.
    await this.orderRepo.update(
      { id: order.id, paymentLinkId: IsNull() },
      {
        paymentLinkId: link.paymentLinkId,
        checkoutUrl: link.checkoutUrl,
        qrCode: link.qrCode,
      },
    );
    return this.orderRepo.findOneByOrFail({ id: order.id });
  }

  private redirectUrl(
    overrideKey: 'PAYOS_RETURN_URL' | 'PAYOS_CANCEL_URL',
    orderId: string,
  ): string {
    const configured = this.config.getOrThrow(overrideKey, { infer: true });
    const base =
      configured ||
      this.config.getOrThrow('PAYOS_WEB_WALLET_URL', { infer: true });
    if (!base) {
      throw new DomainException(
        EconomyErrors.PAYOS_DISABLED,
        'Thiếu URL quay lại ví web cho payOS',
        HttpStatus.SERVICE_UNAVAILABLE,
      );
    }
    const url = new URL(base);
    url.searchParams.set('paymentOrder', orderId);
    return url.toString();
  }

  private assertSameCreateRequest(
    order: PayosPaymentOrder,
    requestHash: string,
  ): void {
    if (order.requestHash !== requestHash) {
      throw new DomainException(
        EconomyErrors.PAYOS_ORDER_IDEMPOTENCY_CONFLICT,
        'Idempotency-Key đã dùng cho gói nạp payOS khác',
        HttpStatus.CONFLICT,
      );
    }
  }

  private toOrderView(
    order: PayosPaymentOrder,
    replayed: boolean,
  ): PayosOrderView {
    return {
      orderId: order.id,
      orderCode: order.orderCode,
      amountVnd: order.amountVnd,
      diamonds: order.diamonds,
      status: order.status,
      checkoutUrl: order.checkoutUrl,
      qrCode: order.qrCode,
      expiresAt: order.expiresAt,
      replayed,
    };
  }

  private async lockOrder(
    manager: EntityManager,
    orderId: string,
  ): Promise<PayosPaymentOrder> {
    return manager
      .getRepository(PayosPaymentOrder)
      .createQueryBuilder('payos_order')
      .setLock('pessimistic_write')
      .where('payos_order.id = :orderId', { orderId })
      .getOneOrFail();
  }

  private matchesPaidOrder(
    order: PayosPaymentOrder,
    event: PayosWebhookEvent,
  ): boolean {
    return (
      order.status !== PayosPaymentOrderStatus.Paid &&
      event.success &&
      event.code === PAYOS_SUCCESS_CODE &&
      event.orderCode === order.orderCode &&
      event.amount === order.amountVnd &&
      event.currency === order.currency &&
      event.paymentLinkId === order.paymentLinkId
    );
  }

  private throwOrderNotFound(): never {
    throw new DomainException(
      EconomyErrors.PAYOS_ORDER_NOT_FOUND,
      'Không tìm thấy đơn nạp payOS',
      HttpStatus.NOT_FOUND,
    );
  }

  private throwWebhookMismatch(): never {
    throw new DomainException(
      EconomyErrors.PAYOS_WEBHOOK_MISMATCH,
      'Webhook payOS không khớp snapshot đơn hàng',
      HttpStatus.BAD_REQUEST,
    );
  }
}
