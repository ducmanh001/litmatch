import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';

import { UserService } from './user.service';
import { UpdateProfileDto } from './dto/update-profile.dto';
import { MyProfileDto, PublicProfileDto } from './dto/user-profile.dto';
import { CurrentUser } from '../../common/decorators/current-user.decorator';

import type { AuthenticatedUser } from '../../common/decorators/current-user.decorator';

@ApiTags('users')
@ApiBearerAuth()
@Controller('users')
export class UserController {
  constructor(private readonly userService: UserService) {}

  @Get('me')
  @ApiOperation({ summary: 'Profile của chính mình' })
  @ApiOkResponse({ type: MyProfileDto })
  async getMe(@CurrentUser() user: AuthenticatedUser): Promise<MyProfileDto> {
    return MyProfileDto.from(
      await this.userService.getByIdOrThrow(user.userId),
    );
  }

  @Patch('me')
  @ApiOperation({ summary: 'Cập nhật profile của chính mình' })
  @ApiOkResponse({ type: MyProfileDto })
  async updateMe(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: UpdateProfileDto,
  ): Promise<MyProfileDto> {
    return MyProfileDto.from(
      await this.userService.updateProfile(user.userId, dto),
    );
  }

  @Get(':id')
  @ApiOperation({
    summary: 'Profile công khai (tối thiểu, giữ ẩn danh) của user khác',
  })
  @ApiOkResponse({ type: PublicProfileDto })
  async getPublicProfile(
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<PublicProfileDto> {
    return PublicProfileDto.from(await this.userService.getByIdOrThrow(id));
  }
}
