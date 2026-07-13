import { Controller, Get, Query } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';

import { CurrentUser } from '../../common/decorators/current-user.decorator';
import {
  PalmMatchReadingDto,
  PalmMatchReadingQueryDto,
} from './dto/palm-match.dtos';
import { PalmMatchService } from './palm-match.service';

import type { AuthenticatedUser } from '../../common/decorators/current-user.decorator';

@ApiTags('palm-match')
@ApiBearerAuth()
@Controller('palm-match')
export class PalmMatchController {
  constructor(private readonly palmMatchService: PalmMatchService) {}

  @Get('reading')
  @ApiOperation({
    summary:
      'Nội dung bói toán giải trí — deterministic theo user + category + ngày server (guest dùng được)',
  })
  @ApiOkResponse({ type: PalmMatchReadingDto })
  async getReading(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: PalmMatchReadingQueryDto,
  ): Promise<PalmMatchReadingDto> {
    return this.palmMatchService.getReading(
      user.userId,
      query.category,
      query.targetName,
    );
  }
}
