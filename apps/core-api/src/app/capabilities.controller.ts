import { Controller, Get } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { SkipThrottle } from '@nestjs/throttler';

import { Public } from '../common/decorators/public.decorator';
import { CapabilitiesDto } from './capabilities.dto';
import { CapabilitiesService } from './capabilities.service';

@ApiTags('capabilities')
@Controller('capabilities')
export class CapabilitiesController {
  constructor(private readonly capabilities: CapabilitiesService) {}

  @Public()
  @SkipThrottle()
  @Get()
  @ApiOperation({
    summary: 'Runtime capability contract cho mọi frontend',
    description:
      'Phản ánh provider/credential thật; frontend không tự suy availability từ build env.',
  })
  @ApiOkResponse({ type: CapabilitiesDto })
  getCapabilities(): CapabilitiesDto {
    return this.capabilities.getCapabilities();
  }
}
