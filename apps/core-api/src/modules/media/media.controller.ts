import { Body, Controller, Post } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiCreatedResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';

import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { MediaService } from './media.service';
import {
  CreateImageUploadIntentDto,
  ImageUploadIntentDto,
} from './dto/media.dtos';

import type { AuthenticatedUser } from '../../common/decorators/current-user.decorator';

@ApiTags('media')
@ApiBearerAuth()
@Controller('media')
export class MediaController {
  constructor(private readonly mediaService: MediaService) {}

  @Post('images/upload-intent')
  @ApiOperation({
    summary: 'Xin presigned URL upload ảnh — body binary không đi qua core-api',
  })
  @ApiCreatedResponse({ type: ImageUploadIntentDto })
  async createImageUploadIntent(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreateImageUploadIntentDto,
  ): Promise<ImageUploadIntentDto> {
    const result = await this.mediaService.createUploadIntent(user, dto);
    return ImageUploadIntentDto.from(result);
  }
}
