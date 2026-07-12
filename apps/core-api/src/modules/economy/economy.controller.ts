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
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { Throttle, minutes } from '@nestjs/throttler';
import { CursorPageQueryDto } from '@litmatch/common-dtos';

import { EconomyService } from './economy.service';
import { PurchaseVipDto, VerifyIapDto, WalletDto } from './dto/economy.dtos';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import {
  ApiIdempotencyKeyHeader,
  IdempotencyKey,
} from '../../common/decorators/idempotency-key.decorator';

import type { AuthenticatedUser } from '../../common/decorators/current-user.decorator';

@ApiTags('economy')
@ApiBearerAuth()
@Controller('economy')
export class EconomyController {
  constructor(private readonly economyService: EconomyService) {}

  @Get('wallet')
  @ApiOperation({ summary: 'Ví của tôi — balance + VIP (đã derive hết hạn)' })
  @ApiOkResponse({ type: WalletDto })
  getWallet(@CurrentUser() user: AuthenticatedUser): Promise<WalletDto> {
    return this.economyService.getWallet(user.userId);
  }

  @Post('iap/verify')
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 10, ttl: minutes(1) } })
  @ApiOperation({
    summary:
      'Verify receipt IAP và credit diamond — idempotent theo provider transaction id, gửi lại không credit đôi',
  })
  verifyIap(@CurrentUser() user: AuthenticatedUser, @Body() dto: VerifyIapDto) {
    return this.economyService.creditFromIap(
      user.userId,
      dto.provider,
      dto.payload,
      dto.productId,
    );
  }

  @Post('vip/purchase')
  @HttpCode(HttpStatus.OK)
  @ApiIdempotencyKeyHeader()
  @ApiOperation({
    summary: 'Mua VIP bằng diamond — gia hạn cộng dồn nếu đang active',
  })
  purchaseVip(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: PurchaseVipDto,
    @IdempotencyKey() idempotencyKey: string,
  ) {
    return this.economyService.purchaseVip(
      user.userId,
      dto.planId,
      idempotencyKey,
    );
  }

  @Get('transactions')
  @ApiOperation({ summary: 'Lịch sử giao dịch — cursor pagination' })
  listTransactions(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: CursorPageQueryDto,
  ) {
    return this.economyService.listTransactions(
      user.userId,
      query.limit,
      query.cursor,
    );
  }
}
