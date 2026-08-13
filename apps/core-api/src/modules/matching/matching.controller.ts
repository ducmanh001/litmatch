import {
  Body,
  Controller,
  Delete,
  Get,
  Headers,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  Req,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiCreatedResponse,
  ApiOkResponse,
  ApiOperation,
  ApiHeader,
  ApiTags,
} from '@nestjs/swagger';
import { Throttle, minutes } from '@nestjs/throttler';

import { MatchingService } from './matching.service';
import {
  ActiveTicketResponseDto,
  JoinQueueDto,
  SpeedupResultDto,
  TicketDto,
} from './dto/matching.dtos';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import {
  ApiIdempotencyKeyHeader,
  IdempotencyKey,
} from '../../common/decorators/idempotency-key.decorator';

import type { AuthenticatedUser } from '../../common/decorators/current-user.decorator';
import type { Request } from 'express';

@ApiTags('matching')
@ApiBearerAuth()
@Controller('matching')
export class MatchingController {
  constructor(private readonly matchingService: MatchingService) {}

  @Post('tickets')
  @Throttle({ default: { limit: 10, ttl: minutes(1) } }) // rate limit riêng chặt hơn cho vào queue (docs/05 § 5.8)
  @ApiIdempotencyKeyHeader()
  @ApiHeader({
    name: 'X-Guest-Device-Token',
    required: false,
    description: 'Bắt buộc nếu trạng thái user tươi trong DB vẫn là guest',
  })
  @ApiOperation({
    summary: 'Vào hàng đợi matching — 409 nếu đã có ticket đang chờ/đang ghép',
  })
  @ApiCreatedResponse({ type: TicketDto })
  async joinQueue(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: JoinQueueDto,
    @IdempotencyKey() idempotencyKey: string,
    @Headers('x-guest-device-token') guestDeviceToken: string | undefined,
    @Req() req: Request,
  ): Promise<TicketDto> {
    return TicketDto.from(
      await this.matchingService.joinQueue(user, dto, idempotencyKey, {
        deviceToken: guestDeviceToken,
        ip: req.ip || req.socket.remoteAddress || 'unknown',
      }),
      await this.matchingService.getSpeedupPriceDiamondForUser(user.userId),
    );
  }

  @Get('tickets/current')
  @ApiOperation({
    summary:
      'Ticket active (queued/matched) của chính mình — phục hồi queue sau reload',
  })
  @ApiOkResponse({ type: ActiveTicketResponseDto })
  async getCurrentTicket(
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<ActiveTicketResponseDto> {
    return ActiveTicketResponseDto.from(
      await this.matchingService.getActiveTicket(user),
      await this.matchingService.getSpeedupPriceDiamondForUser(user.userId),
    );
  }

  @Get('tickets/:id')
  @ApiOperation({
    summary: 'Trạng thái ticket (poll) — chỉ chủ ticket xem được',
  })
  @ApiOkResponse({ type: TicketDto })
  async getTicket(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<TicketDto> {
    return TicketDto.from(
      await this.matchingService.getTicket(user, id),
      await this.matchingService.getSpeedupPriceDiamondForUser(user.userId),
    );
  }

  @Delete('tickets/:id')
  @ApiOperation({ summary: 'Huỷ ticket của chính mình — chỉ khi đang queued' })
  @ApiOkResponse({ type: TicketDto })
  async cancelTicket(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<TicketDto> {
    return TicketDto.from(
      await this.matchingService.cancelTicket(user, id),
      await this.matchingService.getSpeedupPriceDiamondForUser(user.userId),
    );
  }

  @Post('tickets/:id/confirm')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary:
      'Tương thích session pending_confirm cũ — flow mới được xác nhận ngay khi ghép',
  })
  @ApiOkResponse({ type: TicketDto })
  async confirmTicket(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<TicketDto> {
    return TicketDto.from(
      await this.matchingService.confirmTicket(user, id),
      await this.matchingService.getSpeedupPriceDiamondForUser(user.userId),
    );
  }

  @Post('tickets/:id/speedup')
  @HttpCode(HttpStatus.OK)
  @ApiIdempotencyKeyHeader()
  @ApiOperation({
    summary:
      'Trả diamond để ưu tiên trong hàng đợi — rate limit theo giờ, chặn TRƯỚC khi trừ tiền',
  })
  @ApiOkResponse({ type: SpeedupResultDto })
  async speedup(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @IdempotencyKey() idempotencyKey: string,
  ): Promise<SpeedupResultDto> {
    const result = await this.matchingService.speedup(user, id, idempotencyKey);
    return SpeedupResultDto.from(
      result.transactionId,
      result.replayed,
      result.ticket,
      await this.matchingService.getSpeedupPriceDiamondForUser(user.userId),
    );
  }
}
