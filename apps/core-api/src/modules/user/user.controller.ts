import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Put,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';

import { UserService } from './user.service';
import { UpdateProfileDto } from './dto/update-profile.dto';
import { PrivacySettingsService } from './services/privacy-settings.service';
import { UserPresenceService } from './services/user-presence.service';
import { MyProfileDto, PublicProfileDto } from './dto/user-profile.dto';
import {
  PrivacySettingsDto,
  UpdatePrivacySettingsDto,
  UserPresenceDto,
} from './dto/privacy-setting.dto';
import { CurrentUser } from '../../common/decorators/current-user.decorator';

import type { AuthenticatedUser } from '../../common/decorators/current-user.decorator';

@ApiTags('users')
@ApiBearerAuth()
@Controller('users')
export class UserController {
  constructor(
    private readonly userService: UserService,
    private readonly privacySettings: PrivacySettingsService,
    private readonly presence: UserPresenceService,
  ) {}

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

  @Get('me/privacy')
  @ApiOperation({ summary: 'Privacy settings của chính mình' })
  @ApiOkResponse({ type: PrivacySettingsDto })
  async getMyPrivacy(
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<PrivacySettingsDto> {
    return this.privacySettings.getForUser(user.userId);
  }

  @Put('me/privacy')
  @ApiOperation({ summary: 'Cập nhật privacy settings của chính mình' })
  @ApiOkResponse({ type: PrivacySettingsDto })
  async updateMyPrivacy(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: UpdatePrivacySettingsDto,
  ): Promise<PrivacySettingsDto> {
    return this.privacySettings.updateForUser(user.userId, dto);
  }

  @Get(':id/presence')
  @ApiOperation({
    summary: 'Trạng thái online công khai nếu user đó cho phép hiển thị',
  })
  @ApiOkResponse({ type: UserPresenceDto })
  async getPublicPresence(
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<UserPresenceDto> {
    const settings = await this.privacySettings.getForUser(id);
    const dto = new UserPresenceDto();
    dto.isOnline =
      settings.showOnlineStatus && (await this.presence.isOnline(id));
    return dto;
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
