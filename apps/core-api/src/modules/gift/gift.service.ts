import { HttpStatus, Inject, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { RealtimeEvents } from '@litmatch/common-dtos';
import { DomainException } from '@litmatch/common-exceptions';
import { Repository } from 'typeorm';

import { publishRealtimeEvent } from '../../common/realtime/publish-realtime';
import { giftSendIdempotencyKey } from './gift.constants';
import { GiftErrors } from './gift.errors';
import { Gift } from './entities/gift.entity';
import { GiftEvent } from './entities/gift-event.entity';
import { GIFT_REDIS } from './redis/gift-redis.provider';
import { EconomyService } from '../economy';
import { PartyRoomService } from '../party-room';
import { UserService } from '../user';

import type {
  GiftSentEventData,
  RealtimeEnvelope,
} from '@litmatch/common-dtos';
import type Redis from 'ioredis';
import type { AuthenticatedUser } from '../../common/decorators/current-user.decorator';
import type { CoreApiEnv } from '../../config/env.validation';

export interface SendGiftResult {
  giftEvent: GiftEvent;
  gift: Gift;
  replayed: boolean;
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
      },
    });

    // Replay trả lại đúng event cũ qua unique transaction_id — không tạo event mới
    const giftEvent = await this.giftEventRepo.findOneByOrFail({
      transactionId: result.transactionId,
    });

    if (!result.replayed) {
      await this.publishGiftSent(roomId, gift, giftEvent);
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
