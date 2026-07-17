import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  Query,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiCreatedResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { CursorPageQueryDto } from '@litmatch/common-dtos';

import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { ApiCursorPageQuery } from '../../common/decorators/cursor-page-query.decorator';
import {
  ApiIdempotencyKeyHeader,
  IdempotencyKey,
} from '../../common/decorators/idempotency-key.decorator';
import {
  CreateSupportTicketDto,
  SupportTicketDto,
  SupportTicketsPageDto,
} from './dto/support.dtos';
import { SupportService } from './support.service';

import type { AuthenticatedUser } from '../../common/decorators/current-user.decorator';

@ApiTags('support')
@ApiBearerAuth()
@Controller('support/tickets')
export class SupportController {
  constructor(private readonly supportService: SupportService) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @ApiIdempotencyKeyHeader()
  @ApiOperation({ summary: 'Gửi phản hồi/yêu cầu hỗ trợ — idempotent' })
  @ApiCreatedResponse({ type: SupportTicketDto })
  async create(
    @CurrentUser() user: AuthenticatedUser,
    @Body() body: CreateSupportTicketDto,
    @IdempotencyKey() idempotencyKey: string,
  ): Promise<SupportTicketDto> {
    return SupportTicketDto.from(
      await this.supportService.createTicket(user.userId, body, idempotencyKey),
    );
  }

  @Get('me')
  @ApiCursorPageQuery()
  @ApiOperation({ summary: 'Theo dõi các yêu cầu hỗ trợ của chính mình' })
  @ApiOkResponse({ type: SupportTicketsPageDto })
  async listMine(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: CursorPageQueryDto,
  ): Promise<SupportTicketsPageDto> {
    const page = await this.supportService.listMine(
      user.userId,
      query.limit,
      query.cursor,
    );
    return { items: page.items.map(SupportTicketDto.from), meta: page.meta };
  }
}
