import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  Put,
  Query,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { IsEnum, IsOptional } from 'class-validator';

import { AvatarService } from './avatar.service';
import {
  AvatarAssetDto,
  AvatarBuyResultDto,
  AvatarConfigDto,
  EquipAvatarItemDto,
} from './dto/avatar.dtos';
import { AvatarSlot } from './entities/avatar-asset.entity';
import {
  ApiIdempotencyKeyHeader,
  IdempotencyKey,
} from '../../common/decorators/idempotency-key.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';

import type { AuthenticatedUser } from '../../common/decorators/current-user.decorator';

class CatalogQueryDto {
  @IsOptional()
  @IsEnum(AvatarSlot)
  slot?: AvatarSlot;
}

@ApiTags('avatar')
@ApiBearerAuth()
@Controller('avatar')
export class AvatarController {
  constructor(private readonly avatarService: AvatarService) {}

  @Get('catalog')
  @ApiOperation({
    summary: 'Catalog item đang bật — giá server là nguồn sự thật',
  })
  @ApiOkResponse({ type: [AvatarAssetDto] })
  async listCatalog(
    @Query() query: CatalogQueryDto,
  ): Promise<AvatarAssetDto[]> {
    return (await this.avatarService.listCatalog(query.slot)).map(
      AvatarAssetDto.from,
    );
  }

  @Get('me/items')
  @ApiOperation({ summary: 'Item avatar mình đang sở hữu' })
  @ApiOkResponse({ type: [AvatarAssetDto] })
  async listMyItems(
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<AvatarAssetDto[]> {
    return (await this.avatarService.listMyItems(user.userId)).map(
      AvatarAssetDto.from,
    );
  }

  @Post('items/:assetId/claim')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Nhận item free — idempotent' })
  async claim(
    @CurrentUser() user: AuthenticatedUser,
    @Param('assetId', ParseUUIDPipe) assetId: string,
  ): Promise<void> {
    await this.avatarService.claim(user.userId, assetId);
  }

  @Post('items/:assetId/buy')
  @HttpCode(HttpStatus.OK)
  @ApiIdempotencyKeyHeader()
  @ApiOperation({ summary: 'Mua item trả phí — trừ diamond qua Economy' })
  @ApiOkResponse({ type: AvatarBuyResultDto })
  async buy(
    @CurrentUser() user: AuthenticatedUser,
    @Param('assetId', ParseUUIDPipe) assetId: string,
    @IdempotencyKey() idempotencyKey: string,
  ): Promise<AvatarBuyResultDto> {
    return this.avatarService.buy(user.userId, assetId, idempotencyKey);
  }

  @Put('me/equip')
  @ApiOperation({
    summary: 'Trang bị item — chỉ item đã sở hữu (docs/10 § Avatar)',
  })
  @ApiOkResponse({ type: AvatarConfigDto })
  async equip(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: EquipAvatarItemDto,
  ): Promise<AvatarConfigDto> {
    const { config, layers } = await this.avatarService.equip(
      user.userId,
      dto.slot,
      dto.avatarAssetId,
    );
    return { userId: config.userId, layers: layers.map(AvatarAssetDto.from) };
  }

  @Get('me')
  @ApiOperation({
    summary: 'Avatar của chính mình — lazy-init default nếu chưa có',
  })
  @ApiOkResponse({ type: AvatarConfigDto })
  async getMyAvatar(
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<AvatarConfigDto> {
    const { config, layers } = await this.avatarService.getMyAvatar(
      user.userId,
    );
    return { userId: config.userId, layers: layers.map(AvatarAssetDto.from) };
  }

  @Get('users/:userId')
  @ApiOperation({ summary: 'Xem avatar người khác — public, không cần bạn bè' })
  @ApiOkResponse({ type: AvatarConfigDto })
  async getAvatarOf(
    @Param('userId', ParseUUIDPipe) userId: string,
  ): Promise<AvatarConfigDto> {
    const { config, layers } = await this.avatarService.getAvatarOf(userId);
    return { userId: config.userId, layers: layers.map(AvatarAssetDto.from) };
  }
}
