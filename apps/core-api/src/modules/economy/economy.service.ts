import { HttpStatus, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DomainException } from '@litmatch/common-exceptions';
import { Repository } from 'typeorm';

import type { EntityManager } from 'typeorm';

import { buildCursorPage, decodeCursor } from '@litmatch/common-dtos';

import { ECONOMY_EVENTS_TOPIC } from './economy.constants';
import { EconomyErrors } from './economy.errors';
import { LedgerService } from './services/ledger.service';
import {
  LedgerAccountKind,
  LedgerCurrency,
} from './entities/ledger-account.entity';
import { LedgerDirection } from './entities/ledger-entry.entity';
import { IapProduct, IapProvider, IapReceipt } from './entities/iap.entities';
import { OutboxEvent } from './entities/outbox-event.entity';
import {
  LedgerTransaction,
  TransactionType,
} from './entities/transaction.entity';
import { VipPlan } from './entities/vip-plan.entity';
import { VipTier, Wallet } from './entities/wallet.entity';
import { IapVerifier } from './ports/iap-verifier';

import type { CursorPageMeta } from '@litmatch/common-dtos';

export interface WalletView {
  balance: string;
  earnings: string;
  vipTier: VipTier | null;
  vipExpiresAt: Date | null;
}

export interface TransactionView {
  id: string;
  type: TransactionType;
  status: string;
  diamondDelta: string;
  createdAt: Date;
}

/**
 * Facade nghiệp vụ của Economy — mọi module khác đi qua đây (public API ở index.ts),
 * không bao giờ đụng trực tiếp ledger/wallet repository.
 */
@Injectable()
export class EconomyService {
  constructor(
    @InjectRepository(Wallet) private readonly walletRepo: Repository<Wallet>,
    @InjectRepository(IapProduct)
    private readonly productRepo: Repository<IapProduct>,
    @InjectRepository(VipPlan) private readonly planRepo: Repository<VipPlan>,
    @InjectRepository(LedgerTransaction)
    private readonly txnRepo: Repository<LedgerTransaction>,
    private readonly ledger: LedgerService,
    private readonly iapVerifier: IapVerifier,
  ) {}

  async getWallet(userId: string): Promise<WalletView> {
    const wallet = await this.walletRepo.findOneBy({ userId });
    if (!wallet)
      return { balance: '0', earnings: '0', vipTier: null, vipExpiresAt: null };
    return {
      balance: wallet.balance,
      earnings: wallet.earnings,
      vipTier: wallet.activeVipTier, // hết hạn tự downgrade khi đọc (docs/services/economy-service.md)
      vipExpiresAt: wallet.activeVipTier ? wallet.vipExpiresAt : null,
    };
  }

  /**
   * Nạp diamond từ IAP. Idempotency thật = provider transaction id (server tự sinh) —
   * client gửi lại receipt bao nhiêu lần cũng chỉ credit đúng 1 lần (docs/10 § Economy).
   */
  async creditFromIap(
    userId: string,
    provider: IapProvider,
    payload: Record<string, unknown>,
    productId: string,
  ): Promise<{ transactionId: string; diamonds: string; replayed: boolean }> {
    const product = await this.productRepo.findOneBy({
      productId,
      provider,
      active: true,
    });
    if (!product) {
      throw new DomainException(
        EconomyErrors.IAP_PRODUCT_UNKNOWN,
        `Product ${productId} không tồn tại`,
        HttpStatus.BAD_REQUEST,
      );
    }

    const verified = await this.iapVerifier.verify(
      provider,
      payload,
      productId,
    );
    const diamonds = BigInt(product.diamonds);

    const result = await this.ledger.record({
      type: TransactionType.IapPurchase,
      idempotencyKey: `iap:${provider}:${verified.providerTransactionId}`,
      actorUserId: userId,
      metadata: {
        provider,
        productId,
        providerTransactionId: verified.providerTransactionId,
      },
      entries: [
        {
          accountKind: LedgerAccountKind.SystemIap,
          direction: LedgerDirection.Debit,
          amount: diamonds,
          currency: LedgerCurrency.Diamond,
        },
        {
          accountKind: LedgerAccountKind.UserWallet,
          userId,
          direction: LedgerDirection.Credit,
          amount: diamonds,
          currency: LedgerCurrency.Diamond,
        },
      ],
      withinTransaction: async (manager, txn) => {
        await manager.save(
          manager.create(IapReceipt, {
            provider,
            providerTransactionId: verified.providerTransactionId,
            userId,
            productId,
            transactionId: txn.id, // bắt buộc — job đối soát coi receipt không có transaction là lệch
            rawPayload: payload,
          }),
        );
      },
    });

    return {
      transactionId: result.transaction.id,
      diamonds: diamonds.toString(),
      replayed: result.replayed,
    };
  }

  /** Mua VIP bằng diamond — check số dư diễn ra SAU khi lock ví (trong LedgerService), không phải ở đầu luồng. */
  async purchaseVip(
    userId: string,
    planId: string,
    idempotencyKey: string,
  ): Promise<{
    transactionId: string;
    tier: VipTier;
    vipExpiresAt: Date;
    replayed: boolean;
  }> {
    const plan = await this.planRepo.findOneBy({ id: planId, active: true });
    if (!plan) {
      throw new DomainException(
        EconomyErrors.VIP_PLAN_UNKNOWN,
        `Gói VIP ${planId} không tồn tại`,
        HttpStatus.NOT_FOUND,
      );
    }

    let newExpiry = new Date();
    const result = await this.ledger.record({
      type: TransactionType.VipPurchase,
      idempotencyKey: `vip:${userId}:${idempotencyKey}`,
      actorUserId: userId,
      metadata: { planId, tier: plan.tier, days: plan.days },
      entries: [
        {
          accountKind: LedgerAccountKind.UserWallet,
          userId,
          direction: LedgerDirection.Debit,
          amount: BigInt(plan.priceDiamond),
          currency: LedgerCurrency.Diamond,
        },
        {
          accountKind: LedgerAccountKind.SystemRevenue,
          direction: LedgerDirection.Credit,
          amount: BigInt(plan.priceDiamond),
          currency: LedgerCurrency.Diamond,
        },
      ],
      withinTransaction: async (manager) => {
        // Ví đã bị lock FOR UPDATE trong transaction này — đọc/ghi VIP là an toàn
        const wallet = await manager
          .getRepository(Wallet)
          .findOneByOrFail({ userId });
        const base =
          wallet.vipExpiresAt && wallet.vipExpiresAt > new Date()
            ? wallet.vipExpiresAt
            : new Date();
        newExpiry = new Date(base.getTime() + plan.days * 24 * 3600 * 1000); // gia hạn cộng dồn
        await manager.update(
          Wallet,
          { userId },
          { vipTier: plan.tier, vipExpiresAt: newExpiry },
        );
        await manager.save(
          manager.create(OutboxEvent, {
            topic: ECONOMY_EVENTS_TOPIC,
            eventType: 'economy.vip.purchased',
            payload: {
              version: 1,
              userId,
              planId,
              tier: plan.tier,
              vipExpiresAt: newExpiry.toISOString(),
            },
          }),
        );
      },
    });

    if (result.replayed) {
      // replay: không gia hạn lần 2 — trả trạng thái VIP hiện tại
      const wallet = await this.walletRepo.findOneByOrFail({ userId });
      return {
        transactionId: result.transaction.id,
        tier: plan.tier,
        vipExpiresAt: wallet.vipExpiresAt ?? newExpiry,
        replayed: true,
      };
    }
    return {
      transactionId: result.transaction.id,
      tier: plan.tier,
      vipExpiresAt: newExpiry,
      replayed: false,
    };
  }

  /**
   * Trừ diamond generic cho module khác gọi qua DI (matching speed-up, gift, call billing... —
   * docs/services/matching-service.md § 4): debit UserWallet / credit SystemRevenue qua
   * `ledger.record()` (đã tự lo SELECT FOR UPDATE + idempotency + check số dư tại thời điểm trừ).
   * KHÔNG side-effect nghiệp vụ nào khác ngoài ghi sổ — hiệu ứng riêng của từng domain
   * (boost queue, gửi quà...) là việc của caller, không phình vào Economy.
   * Caller tự prefix idempotencyKey theo domain, vd `matching:speedup:${userId}:${key}`.
   */
  async spendDiamond(
    userId: string,
    type: TransactionType,
    amountDiamond: number,
    idempotencyKey: string,
    metadata: Record<string, unknown>,
  ): Promise<{ transactionId: string; replayed: boolean }> {
    if (!Number.isSafeInteger(amountDiamond) || amountDiamond <= 0) {
      // Lỗi lập trình của caller (giá phải từ config, nguyên dương) — không phải lỗi client → Error, không DomainException
      throw new Error(
        `spendDiamond: amountDiamond phải là số nguyên dương, nhận ${amountDiamond}`,
      );
    }
    const amount = BigInt(amountDiamond);
    const result = await this.ledger.record({
      type,
      idempotencyKey,
      actorUserId: userId,
      metadata,
      entries: [
        {
          accountKind: LedgerAccountKind.UserWallet,
          userId,
          direction: LedgerDirection.Debit,
          amount,
          currency: LedgerCurrency.Diamond,
        },
        {
          accountKind: LedgerAccountKind.SystemRevenue,
          direction: LedgerDirection.Credit,
          amount,
          currency: LedgerCurrency.Diamond,
        },
      ],
    });
    return { transactionId: result.transaction.id, replayed: result.replayed };
  }

  /**
   * Tặng quà — giao dịch nhiều chân, nhiều currency (docs/services/economy-service.md § 6):
   * - Chân DIA: Nợ user_wallet (người tặng) / Có system_gift_pool = đúng giá quà.
   * - Chân PTS: Nợ system_points_mint / Có user_earnings (người nhận) = điểm quy đổi
   *   (caller tính từ config — 0 được phép, vd người nhận là guest, docs/06 § Gift).
   * Cả 2 chân + side effect của caller (`withinTransaction`, vd ghi GiftEvent) nằm trong
   * CÙNG 1 DB transaction — 1 bước fail thì rollback tất cả (docs/10 § Gift). Diamond KHÔNG
   * bao giờ chuyển thẳng user→user: chênh lệch giá − điểm ở lại system_gift_pool.
   */
  async sendGift(input: {
    senderUserId: string;
    receiverUserId: string;
    priceDiamond: number;
    pointsAwarded: number;
    idempotencyKey: string;
    metadata: Record<string, unknown>;
    /** Chạy trong CÙNG DB transaction sau khi ghi sổ (gift module ghi GiftEvent tại đây). */
    withinTransaction?: (
      manager: EntityManager,
      transactionId: string,
    ) => Promise<void>;
  }): Promise<{ transactionId: string; replayed: boolean }> {
    const {
      senderUserId,
      receiverUserId,
      priceDiamond,
      pointsAwarded,
      idempotencyKey,
      metadata,
    } = input;
    // Các check dưới là lỗi lập trình của caller (giá từ catalog DB, điểm từ config) → Error,
    // không DomainException — gift module đã validate input client trước khi gọi tới đây.
    if (!Number.isSafeInteger(priceDiamond) || priceDiamond <= 0) {
      throw new Error(
        `sendGift: priceDiamond phải là số nguyên dương, nhận ${priceDiamond}`,
      );
    }
    if (!Number.isSafeInteger(pointsAwarded) || pointsAwarded < 0) {
      throw new Error(
        `sendGift: pointsAwarded phải là số nguyên >= 0, nhận ${pointsAwarded}`,
      );
    }
    if (pointsAwarded > priceDiamond) {
      // Bất biến chống nhân đôi giá trị (docs/06 § Gift: tỉ lệ quy đổi < 1:1)
      throw new Error(
        `sendGift: pointsAwarded (${pointsAwarded}) không được vượt priceDiamond (${priceDiamond})`,
      );
    }
    if (senderUserId === receiverUserId) {
      throw new Error('sendGift: không tự tặng quà cho chính mình');
    }

    const price = BigInt(priceDiamond);
    const points = BigInt(pointsAwarded);
    const entries = [
      {
        accountKind: LedgerAccountKind.UserWallet,
        userId: senderUserId,
        direction: LedgerDirection.Debit,
        amount: price,
        currency: LedgerCurrency.Diamond,
      },
      {
        accountKind: LedgerAccountKind.SystemGiftPool,
        direction: LedgerDirection.Credit,
        amount: price,
        currency: LedgerCurrency.Diamond,
      },
      // Chân PTS chỉ tồn tại khi có điểm thưởng — amount 0 bị validateEntries chặn
      ...(points > 0n
        ? [
            {
              accountKind: LedgerAccountKind.SystemPointsMint,
              direction: LedgerDirection.Debit,
              amount: points,
              currency: LedgerCurrency.Points,
            },
            {
              accountKind: LedgerAccountKind.UserEarnings,
              userId: receiverUserId,
              direction: LedgerDirection.Credit,
              amount: points,
              currency: LedgerCurrency.Points,
            },
          ]
        : []),
    ];

    const result = await this.ledger.record({
      type: TransactionType.GiftSend,
      idempotencyKey,
      actorUserId: senderUserId,
      metadata: { ...metadata, receiverUserId },
      entries,
      withinTransaction: async (manager, txn) => {
        // Event nghiệp vụ riêng (pattern VIP) — consumer notification/analytics cần receiver,
        // event mặc định economy.diamond.debited chỉ nói về ví người tặng
        await manager.save(
          manager.create(OutboxEvent, {
            topic: ECONOMY_EVENTS_TOPIC,
            eventType: 'economy.gift.sent',
            payload: {
              version: 1,
              transactionId: txn.id,
              senderUserId,
              receiverUserId,
              priceDiamond: price.toString(),
              pointsAwarded: points.toString(),
              ...metadata,
            },
          }),
        );
        await input.withinTransaction?.(manager, txn.id);
      },
    });
    return { transactionId: result.transaction.id, replayed: result.replayed };
  }

  /**
   * 1 idempotency key đã có giao dịch ghi sổ chưa — read-only, cho caller phân biệt RETRY
   * (phải replay kết quả cũ — docs/05 § 5.10) với LƯỢT MỚI trước khi áp rate-limit riêng
   * của domain (vd matching speed-up: retry request đã trả tiền không được ăn 409 rate-limit).
   */
  async hasTransaction(idempotencyKey: string): Promise<boolean> {
    return (await this.txnRepo.countBy({ idempotencyKey })) > 0;
  }

  /** Lịch sử giao dịch — cursor pagination (docs/05 § 5.4), diamondDelta ký hiệu +/− theo ví user. */
  async listTransactions(
    userId: string,
    limit: number,
    cursor?: string,
  ): Promise<{ data: TransactionView[]; meta: CursorPageMeta }> {
    const qb = this.txnRepo
      .createQueryBuilder('t')
      .select([
        't.id AS id',
        't.type AS type',
        't.status AS status',
        't.created_at AS created_at',
      ])
      .addSelect(
        `COALESCE(SUM(CASE WHEN la.kind = 'user_wallet' AND la.user_id = :userId
            THEN (CASE WHEN le.direction = 'credit' THEN le.amount ELSE -le.amount END) ELSE 0 END), 0)`,
        'diamond_delta',
      )
      .innerJoin('ledger_entries', 'le', 'le.transaction_id = t.id')
      .innerJoin('ledger_accounts', 'la', 'la.id = le.account_id')
      .where('t.actor_user_id = :userId', { userId })
      .groupBy('t.id')
      .orderBy('t.created_at', 'DESC')
      .addOrderBy('t.id', 'DESC')
      .limit(limit + 1);

    if (cursor) {
      // decode/encode qua helper chuẩn của @litmatch/common-dtos (docs/05 § 5.3) — không tự chế format cursor riêng
      const pos = decodeCursor<{ createdAt: string; id: string }>(cursor);
      if (!pos?.createdAt || !pos?.id) {
        throw new DomainException(
          EconomyErrors.CURSOR_INVALID,
          'Cursor không hợp lệ',
          HttpStatus.BAD_REQUEST,
        );
      }
      qb.andWhere('(t.created_at, t.id) < (:cursorCreatedAt, :cursorId)', {
        cursorCreatedAt: pos.createdAt,
        cursorId: pos.id,
      });
    }

    const rows: Array<{
      id: string;
      type: TransactionType;
      status: string;
      created_at: Date;
      diamond_delta: string;
    }> = await qb.getRawMany();
    const page = buildCursorPage(rows, limit, (last) => ({
      createdAt: last.created_at.toISOString(),
      id: last.id,
    }));

    return {
      data: page.items.map((r) => ({
        id: r.id,
        type: r.type,
        status: r.status,
        diamondDelta: r.diamond_delta,
        createdAt: r.created_at,
      })),
      meta: page.meta,
    };
  }

  /**
   * Admin hoàn tiền thủ công một giao dịch (docs/12 § 12.7) — tái dùng nguyên `ledger.reverse`,
   * KHÔNG thêm cơ chế reversal mới. `actorUserId` luôn là admin thật (không phải `null` = hệ
   * thống tự động như refund IAP webhook), `reason` bắt buộc để audit lại được (docs/10 § 10.2
   * "reversal thủ công không ghi actor + lý do → không audit được"). Idempotency key tất định
   * theo `transactionId` — admin bấm refund lại cùng giao dịch không tạo 2 bút toán đảo khác
   * nhau; `ledger.reverse` tự chặn double-reverse qua `TRANSACTION_ALREADY_REVERSED`.
   */
  async adminRefundTransaction(
    transactionId: string,
    reason: string,
    actorUserId: string,
    /** Side effect chạy CÙNG DB transaction với bút toán đảo (vd AdminModule ghi audit log). */
    withinTransaction?: (manager: EntityManager) => Promise<void>,
  ): Promise<{ transactionId: string; reversalTransactionId: string }> {
    const result = await this.ledger.reverse(
      transactionId,
      `admin-refund:${transactionId}`,
      reason,
      {
        actorUserId,
        outboxEventTypeOverride: 'economy.diamond.refunded',
        withinTransaction: withinTransaction
          ? (manager) => withinTransaction(manager)
          : undefined,
      },
    );
    return {
      transactionId,
      reversalTransactionId: result.transaction.id,
    };
  }
}
