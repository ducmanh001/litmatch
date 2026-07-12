import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { Throttle, minutes } from '@nestjs/throttler';

import { GiftService } from './gift.service';
import { GiftDto, GiftEventDto, SendGiftDto } from './dto/gift.dtos';
import {
  ApiIdempotencyKeyHeader,
  IdempotencyKey,
} from '../../common/decorators/idempotency-key.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';

import type { AuthenticatedUser } from '../../common/decorators/current-user.decorator';

@ApiTags('gift')
@ApiBearerAuth()
@Controller()
export class GiftController {
  constructor(private readonly giftService: GiftService) {}

  @Get('gifts')
  @ApiOperation({
    summary: 'Catalog quà đang bật — giá server là nguồn sự thật',
  })
  @ApiOkResponse({ type: [GiftDto] })
  async listCatalog(): Promise<GiftDto[]> {
    return (await this.giftService.listCatalog()).map(GiftDto.from);
  }

  @Post('party/rooms/:roomId/gifts')
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 30, ttl: minutes(1) } })
  @ApiIdempotencyKeyHeader()
  @ApiOperation({
    summary:
      'Tặng quà trong phòng — trừ DIA người tặng + cộng PTS người nhận atomic; client chỉ bắn hiệu ứng sau khi nhận 200',
  })
  @ApiOkResponse({ type: GiftEventDto })
  async sendGift(
    @CurrentUser() user: AuthenticatedUser,
    @Param('roomId', ParseUUIDPipe) roomId: string,
    @Body() body: SendGiftDto,
    @IdempotencyKey() idempotencyKey: string,
  ): Promise<GiftEventDto> {
    const { giftEvent, gift, replayed } = await this.giftService.sendGift(
      user,
      roomId,
      body.giftId,
      body.receiverUserId,
      idempotencyKey,
    );
    return GiftEventDto.from(giftEvent, gift.code, replayed);
  }
}
