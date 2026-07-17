import { Body, Controller, Get, Put, Query } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiNoContentResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';

import { DiscoveryService } from './discovery.service';
import { NearbyService } from './nearby.service';
import { BrowseQueryDto, DiscoveryCardsPageDto } from './dto/discovery.dtos';
import {
  NearbyCardsPageDto,
  NearbyQueryDto,
  SetLocationDto,
  SetNearbyVisibleDto,
} from './dto/nearby.dtos';
import { ApiCursorPageQuery } from '../../common/decorators/cursor-page-query.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';

import type { AuthenticatedUser } from '../../common/decorators/current-user.decorator';

@ApiTags('discovery')
@ApiBearerAuth()
@Controller('discovery')
export class DiscoveryController {
  constructor(
    private readonly discoveryService: DiscoveryService,
    private readonly nearbyService: NearbyService,
  ) {}

  @Get('browse')
  @ApiOperation({
    summary:
      'Duyệt user theo tiêu chí gender/tuổi — loại block/report 2 chiều, chỉ xem profile. Filter khu vực thuộc về Nearby.',
  })
  @ApiCursorPageQuery()
  @ApiOkResponse({ type: DiscoveryCardsPageDto })
  async browse(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: BrowseQueryDto,
  ): Promise<DiscoveryCardsPageDto> {
    return DiscoveryCardsPageDto.from(
      await this.discoveryService.browse(user, query),
    );
  }

  @Put('nearby/location')
  @ApiOperation({
    summary:
      'Ghi vị trí hiện tại — server tự quantize ~500m, không lưu/trả toạ độ thô.',
  })
  @ApiNoContentResponse()
  async setLocation(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: SetLocationDto,
  ): Promise<void> {
    await this.nearbyService.setLocation(user, dto);
  }

  @Put('nearby/visible')
  @ApiOperation({
    summary:
      'Bật/tắt hiển thị Nearby (opt-in, mặc định tắt) — tắt sẽ xoá vị trí đã lưu.',
  })
  @ApiNoContentResponse()
  async setVisible(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: SetNearbyVisibleDto,
  ): Promise<void> {
    await this.nearbyService.setVisible(user, dto.visible);
  }

  @Get('nearby')
  @ApiOperation({
    summary:
      'Duyệt user gần vị trí đã bật Nearby (reciprocity) — chỉ trả distance bucket, không bao giờ trả km/toạ độ chính xác.',
  })
  @ApiCursorPageQuery()
  @ApiOkResponse({ type: NearbyCardsPageDto })
  async nearby(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: NearbyQueryDto,
  ): Promise<NearbyCardsPageDto> {
    return NearbyCardsPageDto.from(
      await this.nearbyService.listNearby(user, query),
    );
  }
}
