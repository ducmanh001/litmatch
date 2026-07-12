import { ApiProperty } from '@nestjs/swagger';
import { IsUUID } from 'class-validator';

import { Gift } from '../entities/gift.entity';
import { GiftEvent } from '../entities/gift-event.entity';

export class SendGiftDto {
  @ApiProperty()
  @IsUUID()
  giftId!: string;

  @ApiProperty()
  @IsUUID()
  receiverUserId!: string;
}

export class GiftDto {
  @ApiProperty() id!: string;
  @ApiProperty() code!: string;
  @ApiProperty() name!: string;
  @ApiProperty() priceDiamond!: number;

  static from(gift: Gift): GiftDto {
    const dto = new GiftDto();
    dto.id = gift.id;
    dto.code = gift.code;
    dto.name = gift.name;
    dto.priceDiamond = gift.priceDiamond;
    return dto;
  }
}

export class GiftEventDto {
  @ApiProperty() id!: string;
  @ApiProperty() giftId!: string;
  @ApiProperty() giftCode!: string;
  @ApiProperty() roomId!: string;
  @ApiProperty() senderUserId!: string;
  @ApiProperty() receiverUserId!: string;
  @ApiProperty() priceDiamond!: number;
  @ApiProperty({ description: '0 nếu người nhận là guest (docs/06 § Gift)' })
  pointsAwarded!: number;
  @ApiProperty() createdAt!: Date;
  /** true = retry cùng Idempotency-Key — trả lại event cũ, không trừ tiền lần 2. */
  @ApiProperty() replayed!: boolean;

  static from(
    event: GiftEvent,
    giftCode: string,
    replayed: boolean,
  ): GiftEventDto {
    const dto = new GiftEventDto();
    dto.id = event.id;
    dto.giftId = event.giftId;
    dto.giftCode = giftCode;
    dto.roomId = event.roomId;
    dto.senderUserId = event.senderUserId;
    dto.receiverUserId = event.receiverUserId;
    dto.priceDiamond = event.priceDiamond;
    dto.pointsAwarded = event.pointsAwarded;
    dto.createdAt = event.createdAt;
    dto.replayed = replayed;
    return dto;
  }
}
