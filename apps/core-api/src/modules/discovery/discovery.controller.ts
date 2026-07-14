import { Controller, Get, Query } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';

import { DiscoveryService } from './discovery.service';
import { BrowseQueryDto, DiscoveryCardsPageDto } from './dto/discovery.dtos';
import { ApiCursorPageQuery } from '../../common/decorators/cursor-page-query.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';

import type { AuthenticatedUser } from '../../common/decorators/current-user.decorator';

@ApiTags('discovery')
@ApiBearerAuth()
@Controller('discovery')
export class DiscoveryController {
  constructor(private readonly discoveryService: DiscoveryService) {}

  @Get('browse')
  @ApiOperation({
    summary:
      'Duyệt user theo tiêu chí gender/tuổi — loại block/report 2 chiều, chỉ xem profile (chưa có CTA khác). Filter khu vực thuộc về Nearby (W5), chưa có ở đây.',
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
}
