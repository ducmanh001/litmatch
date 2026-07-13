import { HttpStatus, Inject, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { RealtimeEvents } from '@litmatch/common-dtos';
import { DomainException } from '@litmatch/common-exceptions';
import { Repository } from 'typeorm';

import { publishRealtimeEvent } from '../../common/realtime/publish-realtime';
import {
  isUniqueViolation,
  violatedConstraint,
} from '../../database/postgres-errors';
import { giftSendIdempotencyKey } from './gift.constants';
import { GiftErrors } from './gift.errors';
import { Gift } from './entities/gift.entity';
import { GiftEvent } from './entities/gift-event.entity';
import { GIFT_REDIS } from './redis/gift-redis.provider';
import { EconomyService } from '../economy';
import { NotificationService, NotificationType } from '../notification';
import { PartyRoomService } from '../party-room';
import { UserService } from '../user';

import type { EntityManager } from 'typeorm';
import type {
  GiftSentEventData,
  RealtimeEnvelope,
} from '@litmatch/common-dtos';
import type Redis from 'ioredis';
import type { AuthenticatedUser } from '../../common/decorators/current-user.decorator';
import type { CoreApiEnv } from '../../config/env.validation';
import type { Notification } from '../notification';

export interface SendGiftResult {
  giftEvent: GiftEvent;
  gift: Gift;
  replayed: boolean;
}

export interface CreateGiftInput {
  code: string;
  name: string;
  priceDiamond: number;
  sortOrder?: number;
}

export interface UpdateGiftInput {
  name?: string;
  priceDiamond?: number;
  sortOrder?: number;
  active?: boolean;
}

/**
 * Nghiệp vụ tặng quà trong Party Room (docs/services/gift-service.md).
 * Tiền đi qua `EconomyService.sendGift` — 1 Transaction, 2 chân độc lập theo currency
 * (economy-service.md § 6); GiftEvent ghi trong CÙNG DB transaction qua withinTransaction.
 * Realtime `gift.sent` publish SAU khi transaction tiền commit — client không bao giờ
 * thấy hiệu ứng quà trước khi tiền thật sự trừ xong (docs/10 § Gift).
 */
@Injectable()
export class GiftService {
  private readonly logger = new Logger(GiftService.name);

  constructor(
    @InjectRepository(Gift) private readonly giftRepo: Repository<Gift>,
    @InjectRepository(GiftEvent)
    private readonly giftEventRepo: Repository<GiftEvent>,
    private readonly economy: EconomyService,
    private readonly partyRoomService: PartyRoomService,
    private readonly userService: UserService,
    private readonly notificationService: NotificationService,
    private readonly config: ConfigService<CoreApiEnv, true>,
    @Inject(GIFT_REDIS) private readonly redis: Redis,
  ) {}

  /** Catalog quà đang bật — client map asset theo `code`, giá chỉ để hiển thị (§ 2). */
  async listCatalog(): Promise<Gift[]> {
    return this.giftRepo.find({
      where: { active: true },
      order: { sortOrder: 'ASC', code: 'ASC' },
    });
  }

  /** Admin xem TOÀN BỘ catalog kể cả quà đã tắt (docs/12 § 12.7) — khác `listCatalog` (chỉ active). */
  async listAllForAdmin(): Promise<Gift[]> {
    return this.giftRepo.find({ order: { sortOrder: 'ASC', code: 'ASC' } });
  }

  /**
   * Nhận `manager` để AdminModule ghi CÙNG transaction với audit log. `code` unique ở DB
   * (`uq_gifts_code`) — bắt lỗi race 2 admin cùng tạo trùng code gần như đồng thời.
   */
  async createGift(
    manager: EntityManager,
    input: CreateGiftInput,
  ): Promise<Gift> {
    const repo = manager.getRepository(Gift);
    try {
      return await repo.save(
        repo.create({
          code: input.code,
          name: input.name,
          priceDiamond: input.priceDiamond,
          sortOrder: input.sortOrder ?? 0,
          active: true,
        }),
      );
    } catch (err) {
      if (isUniqueViolation(err) && violatedConstraint(err, 'uq_gifts_code')) {
        throw new DomainException(
          GiftErrors.CODE_ALREADY_EXISTS,
          'Mã quà đã tồn tại',
          HttpStatus.CONFLICT,
        );
      }
      throw err;
    }
  }

  /**
   * Sửa giá/tên/thứ tự/bật-tắt — KHÔNG hard-delete (docs/06: `gift_events` tham chiếu FK tới
   * `gifts.id`, xoá cứng sẽ làm mất lịch sử giao dịch cũ). Tắt bằng `active: false`.
   */
  async updateGift(
    manager: EntityManager,
    giftId: string,
    input: UpdateGiftInput,
  ): Promise<Gift> {
    const repo = manager.getRepository(Gift);
    const gift = await repo.findOneBy({ id: giftId });
    if (!gift) {
      throw new DomainException(
        GiftErrors.GIFT_NOT_FOUND,
        'Không tìm thấy quà',
        HttpStatus.NOT_FOUND,
      );
    }
    if (input.name !== undefined) gift.name = input.name;
    if (input.priceDiamond !== undefined)
      gift.priceDiamond = input.priceDiamond;
    if (input.sortOrder !== undefined) gift.sortOrder = input.sortOrder;
    if (input.active !== undefined) gift.active = input.active;
    return repo.save(gift);
  }

  async sendGift(
    user: AuthenticatedUser,
    roomId: string,
    giftId: string,
    receiverUserId: string,
    idempotencyKey: string,
  ): Promise<SendGiftResult> {
    if (receiverUserId === user.userId) {
      throw new DomainException(
        GiftErrors.SELF_GIFT_FORBIDDEN,
        'Không tự tặng quà cho chính mình',
        HttpStatus.BAD_REQUEST,
      );
    }

    // Giá đọc từ DB TẠI THỜI ĐIỂM tặng — client chỉ gửi giftId, không gửi giá (docs/10 § Gift)
    const gift = await this.giftRepo.findOneBy({ id: giftId, active: true });
    if (!gift) {
      throw new DomainException(
        GiftErrors.GIFT_NOT_FOUND,
        'Quà không tồn tại hoặc đã ngừng bán',
        HttpStatus.NOT_FOUND,
      );
    }

    // Cả 2 phải là member active của phòng active (spec § 3) — check nghiệp vụ, không phải
    // chốt an toàn tiền: tiền đúng bất kể race rời-phòng nhờ transaction + idempotency ở economy
    const { members } =
      await this.partyRoomService.getActiveRoomMembers(roomId);
    if (!members.some((m) => m.userId === user.userId)) {
      throw new DomainException(
        GiftErrors.SENDER_NOT_IN_ROOM,
        'Bạn không ở trong phòng này',
        HttpStatus.FORBIDDEN,
      );
    }
    if (!members.some((m) => m.userId === receiverUserId)) {
      throw new DomainException(
        GiftErrors.RECEIVER_NOT_IN_ROOM,
        'Người nhận không ở trong phòng này',
        HttpStatus.CONFLICT,
      );
    }

    // Guest không nhận điểm quy đổi (docs/06 § Gift) — quà vẫn tặng được, chân PTS = 0
    const receiver = await this.userService.getByIdOrThrow(receiverUserId);
    const ratePercent = this.config.getOrThrow('GIFT_POINTS_RATE_PERCENT', {
      infer: true,
    });
    const pointsAwarded = receiver.isGuest
      ? 0
      : Math.floor((gift.priceDiamond * ratePercent) / 100);

    let notification: Notification | undefined;
    const result = await this.economy.sendGift({
      senderUserId: user.userId,
      receiverUserId,
      priceDiamond: gift.priceDiamond,
      pointsAwarded,
      idempotencyKey: giftSendIdempotencyKey(user.userId, idempotencyKey),
      // snapshot tỉ lệ áp dụng vào transactions.metadata (economy-service.md § 6)
      metadata: {
        giftId: gift.id,
        giftCode: gift.code,
        roomId,
        pointsRatePercent: ratePercent,
        receiverIsGuest: receiver.isGuest,
      },
      withinTransaction: async (manager, transactionId) => {
        await manager.save(
          manager.create(GiftEvent, {
            giftId: gift.id,
            roomId,
            senderUserId: user.userId,
            receiverUserId,
            priceDiamond: gift.priceDiamond,
            pointsAwarded,
            pointsRatePercent: ratePercent,
            transactionId,
          }),
        );
        // Party Room không ẩn danh nên lộ senderUserId là đúng (docs/services/notification-service.md § 3)
        notification = await this.notificationService.createWithManager(
          manager,
          {
            userId: receiverUserId,
            type: NotificationType.GiftReceived,
            payload: {
              roomId,
              senderUserId: user.userId,
              giftCode: gift.code,
              priceDiamond: gift.priceDiamond,
            },
          },
        );
      },
    });

    // Replay trả lại đúng event cũ qua unique transaction_id — không tạo event mới
    const giftEvent = await this.giftEventRepo.findOneByOrFail({
      transactionId: result.transactionId,
    });

    if (!result.replayed) {
      await this.publishGiftSent(roomId, gift, giftEvent);
      if (notification) await this.notificationService.sendPush(notification);
    }
    return { giftEvent, gift, replayed: result.replayed };
  }

  // ---------- nội bộ ----------

  /** Fanout `gift.sent` cho member active — SAU commit, best-effort (client còn REST). */
  private async publishGiftSent(
    roomId: string,
    gift: Gift,
    event: GiftEvent,
  ): Promise<void> {
    const envelope: RealtimeEnvelope<GiftSentEventData> = {
      event: RealtimeEvents.GiftSent,
      data: {
        roomId,
        giftEventId: event.id,
        giftCode: gift.code,
        senderUserId: event.senderUserId,
        receiverUserId: event.receiverUserId,
        priceDiamond: event.priceDiamond,
        pointsAwarded: event.pointsAwarded,
        sentAt: event.createdAt.toISOString(),
      },
    };
    try {
      const { members } =
        await this.partyRoomService.getActiveRoomMembers(roomId);
      await Promise.all(
        members.map((m) =>
          publishRealtimeEvent(this.redis, this.logger, m.userId, envelope),
        ),
      );
    } catch (err) {
      // phòng vừa đóng giữa chừng — giao dịch quà vẫn hợp lệ, chỉ mất hiệu ứng realtime
      this.logger.warn(
        `Fanout gift.sent phòng ${roomId} bỏ qua: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }
}
