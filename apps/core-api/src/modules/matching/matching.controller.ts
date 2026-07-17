import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiCreatedResponse,
  ApiOkResponse,
  ApiOperation,
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

@ApiTags('matching')
@ApiBearerAuth()
@Controller('matching')
export class MatchingController {
  constructor(private readonly matchingService: MatchingService) {}

  @Post('tickets')
  @Throttle({ default: { limit: 10, ttl: minutes(1) } }) // rate limit riêng chặt hơn cho vào queue (docs/05 § 5.8)
  @ApiIdempotencyKeyHeader()
  @ApiOperation({
    summary: 'Vào hàng đợi matching — 409 nếu đã có ticket đang chờ/đang ghép',
  })
  @ApiCreatedResponse({ type: TicketDto })
  async joinQueue(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: JoinQueueDto,
    @IdempotencyKey() idempotencyKey: string,
  ): Promise<TicketDto> {
    return TicketDto.from(
      await this.matchingService.joinQueue(user, dto, idempotencyKey),
      this.matchingService.getSpeedupPriceDiamond(),
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
      this.matchingService.getSpeedupPriceDiamond(),
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
      this.matchingService.getSpeedupPriceDiamond(),
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
      this.matchingService.getSpeedupPriceDiamond(),
    );
  }

  @Post('tickets/:id/confirm')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary:
      'Xác nhận match — đủ 2 bên confirm thì session + 2 ticket sang confirmed',
  })
  @ApiOkResponse({ type: TicketDto })
  async confirmTicket(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<TicketDto> {
    return TicketDto.from(
      await this.matchingService.confirmTicket(user, id),
      this.matchingService.getSpeedupPriceDiamond(),
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
      this.matchingService.getSpeedupPriceDiamond(),
    );
  }
}
