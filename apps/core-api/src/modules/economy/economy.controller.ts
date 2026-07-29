import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
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
import { EconomyErrors } from './economy.errors';
import { PayosService } from './services/payos.service';
import {
  CreatePayosOrderDto,
  IapProductDto,
  PayosOrderDto,
  PayosOrderStatusDto,
  PayosPackageDto,
  PurchaseVipDto,
  VerifyIapDto,
  VipPlanDto,
  VipPurchaseResultDto,
  WalletDto,
} from './dto/economy.dtos';
import { ApiCursorPageQuery } from '../../common/decorators/cursor-page-query.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import {
  ApiIdempotencyKeyHeader,
  IdempotencyKey,
} from '../../common/decorators/idempotency-key.decorator';

import type { AuthenticatedUser } from '../../common/decorators/current-user.decorator';
import { DomainException } from '@litmatch/common-exceptions';

@ApiTags('economy')
@ApiBearerAuth()
@Controller('economy')
export class EconomyController {
  constructor(
    private readonly economyService: EconomyService,
    private readonly payosService: PayosService,
  ) {}

  @Get('wallet')
  @ApiOperation({ summary: 'Ví của tôi — balance + VIP (đã derive hết hạn)' })
  @ApiOkResponse({ type: WalletDto })
  getWallet(@CurrentUser() user: AuthenticatedUser): Promise<WalletDto> {
    return this.economyService.getWallet(user.userId);
  }

  @Get('iap/products')
  @ApiOperation({ summary: 'Catalog gói diamond đang bán (active)' })
  @ApiOkResponse({ type: IapProductDto, isArray: true })
  listIapProducts(): Promise<IapProductDto[]> {
    return this.economyService.listIapProducts();
  }

  @Get('payos/packages')
  @ApiOperation({ summary: 'Catalog gói nạp Diamond payOS đang bán' })
  @ApiOkResponse({ type: PayosPackageDto, isArray: true })
  listPayosPackages(): Promise<PayosPackageDto[]> {
    return this.payosService.listPackages();
  }

  @Post('payos/orders')
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 10, ttl: minutes(1) } })
  @ApiIdempotencyKeyHeader()
  @ApiOperation({
    summary:
      'Tạo checkout payOS idempotent; giá và diamond luôn snapshot từ catalog server',
  })
  @ApiOkResponse({ type: PayosOrderDto })
  async createPayosOrder(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreatePayosOrderDto,
    @IdempotencyKey() idempotencyKey: string,
  ): Promise<PayosOrderDto> {
    this.assertNotGuestForPayos(user);
    return this.payosService.createOrder(
      user.userId,
      dto.packageId,
      idempotencyKey,
    );
  }

  @Get('payos/orders/:orderId')
  @ApiOperation({
    summary:
      'Trạng thái nạp payOS từ server; return URL/browser không phải bằng chứng thanh toán',
  })
  @ApiOkResponse({ type: PayosOrderStatusDto })
  getPayosOrderStatus(
    @CurrentUser() user: AuthenticatedUser,
    @Param('orderId', new ParseUUIDPipe({ version: '4' })) orderId: string,
  ): Promise<PayosOrderStatusDto> {
    return this.payosService.getOrderStatus(user.userId, orderId);
  }

  @Get('vip/plans')
  @ApiOperation({ summary: 'Catalog gói VIP đang bán (active)' })
  @ApiOkResponse({ type: VipPlanDto, isArray: true })
  listVipPlans(): Promise<VipPlanDto[]> {
    return this.economyService.listVipPlans();
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
  @ApiOkResponse({ type: VipPurchaseResultDto })
  purchaseVip(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: PurchaseVipDto,
    @IdempotencyKey() idempotencyKey: string,
  ): Promise<VipPurchaseResultDto> {
    return this.economyService.purchaseVip(
      user.userId,
      dto.planId,
      idempotencyKey,
    );
  }

  @Get('transactions')
  @ApiOperation({ summary: 'Lịch sử giao dịch — cursor pagination' })
  @ApiCursorPageQuery()
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

  private assertNotGuestForPayos(user: AuthenticatedUser): void {
    if (user.isGuest) {
      throw new DomainException(
        EconomyErrors.PAYOS_GUEST_FORBIDDEN,
        'Guest chưa gắn phone/social không thể nạp Diamond',
        HttpStatus.FORBIDDEN,
      );
    }
  }
}
