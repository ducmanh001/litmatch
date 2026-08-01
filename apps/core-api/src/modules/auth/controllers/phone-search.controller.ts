import { Controller, Get, Query } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { Throttle, minutes } from '@nestjs/throttler';

import { PublicProfileDto } from '../../user';
import { SearchByPhoneDto } from '../dto/auth-request.dtos';
import { PhoneSearchService } from '../services/phone-search.service';

@ApiTags('auth')
@ApiBearerAuth()
@Controller('auth')
export class PhoneSearchController {
  constructor(private readonly phoneSearch: PhoneSearchService) {}

  @Get('search-by-phone')
  @Throttle({ default: { limit: 10, ttl: minutes(1) } })
  @ApiOperation({
    summary: 'Tìm hồ sơ bằng số điện thoại khi chủ hồ sơ cho phép',
  })
  @ApiOkResponse({ type: PublicProfileDto, nullable: true })
  search(@Query() query: SearchByPhoneDto): Promise<PublicProfileDto | null> {
    return this.phoneSearch.search(query.phone);
  }
}
