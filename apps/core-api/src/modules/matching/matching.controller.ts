import { Body, Controller, Delete, Get, Headers, HttpCode, Param, ParseUUIDPipe, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiHeader, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';

import { MatchingService } from './matching.service';
import { CreateMatchTicketDto, MatchTicketDto } from './dto/matching.dtos';

import { CurrentUser } from '../../common/decorators/current-user.decorator';

import type { AuthenticatedUser } from '../../common/decorators/current-user.decorator';

@ApiTags('matching')
@ApiBearerAuth()
@Controller('matching/tickets')
export class MatchingController {
  constructor(private readonly matchingService: MatchingService) {}

  @Post()
  @HttpCode(201)
  @Throttle({ default: { limit: 5, ttl: 60_000 } }) // vào queue matching cần rate-limit riêng (docs/05 § 5.8)
  @ApiHeader({ name: 'Idempotency-Key', required: true, description: 'Bắt buộc — đặt match ticket (docs/05 § 5.10)' })
  @ApiOperation({ summary: 'Vào hàng đợi ghép cặp (Soul/Voice Match)' })
  @ApiOkResponse({ type: MatchTicketDto })
  create(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreateMatchTicketDto,
    @Headers('idempotency-key') idempotencyKey?: string,
  ): Promise<MatchTicketDto> {
    return this.matchingService.createTicket(user.userId, dto, idempotencyKey);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Poll trạng thái ticket' })
  @ApiOkResponse({ type: MatchTicketDto })
  get(@CurrentUser() user: AuthenticatedUser, @Param('id', ParseUUIDPipe) id: string): Promise<MatchTicketDto> {
    return this.matchingService.getTicket(user.userId, id);
  }

  @Delete(':id')
  @HttpCode(200)
  @ApiOperation({ summary: 'Huỷ ticket đang chờ ghép' })
  @ApiOkResponse({ type: MatchTicketDto })
  cancel(@CurrentUser() user: AuthenticatedUser, @Param('id', ParseUUIDPipe) id: string): Promise<MatchTicketDto> {
    return this.matchingService.cancelTicket(user.userId, id);
  }

  @Post(':id/confirm')
  @HttpCode(200)
  @ApiOperation({ summary: 'Xác nhận sẵn sàng sau khi thấy trạng thái matched — không tự động' })
  @ApiOkResponse({ type: MatchTicketDto })
  confirm(@CurrentUser() user: AuthenticatedUser, @Param('id', ParseUUIDPipe) id: string): Promise<MatchTicketDto> {
    return this.matchingService.confirmTicket(user.userId, id);
  }

  @Post(':id/speedup')
  @HttpCode(200)
  @ApiHeader({ name: 'Idempotency-Key', required: true, description: 'Bắt buộc cho mọi API trừ diamond (docs/05 § 5.4)' })
  @ApiOperation({ summary: 'Trả diamond để tăng ưu tiên ghép cặp (giới hạn số lần/giờ)' })
  @ApiOkResponse({ type: MatchTicketDto })
  speedup(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Headers('idempotency-key') idempotencyKey?: string,
  ): Promise<MatchTicketDto> {
    return this.matchingService.applySpeedup(user.userId, id, idempotencyKey);
  }
}
