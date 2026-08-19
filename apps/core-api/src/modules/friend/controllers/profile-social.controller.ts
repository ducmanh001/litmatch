import {
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';

import { CurrentUser } from '../../../common/decorators/current-user.decorator';
import { ConversationDto } from '../dto/friend.dtos';
import {
  ProfileActionsDto,
  ProfileFollowDto,
} from '../dto/profile-social.dtos';
import { ProfileSocialService } from '../services/profile-social.service';

import type { AuthenticatedUser } from '../../../common/decorators/current-user.decorator';

@ApiTags('profiles')
@ApiBearerAuth()
@Controller('profiles')
export class ProfileSocialController {
  constructor(private readonly profileSocial: ProfileSocialService) {}

  @Get(':profileUserId/actions')
  @ApiOperation({ summary: 'Trạng thái follow và quyền nhắn tin từ profile' })
  @ApiOkResponse({ type: ProfileActionsDto })
  async getActions(
    @CurrentUser() user: AuthenticatedUser,
    @Param('profileUserId', ParseUUIDPipe) profileUserId: string,
  ): Promise<ProfileActionsDto> {
    return ProfileActionsDto.from(
      await this.profileSocial.getActions(user.userId, profileUserId),
    );
  }

  @Post(':profileUserId/follow')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Theo dõi một profile' })
  @ApiOkResponse({ type: ProfileFollowDto })
  async follow(
    @CurrentUser() user: AuthenticatedUser,
    @Param('profileUserId', ParseUUIDPipe) profileUserId: string,
  ): Promise<ProfileFollowDto> {
    return ProfileFollowDto.from(
      await this.profileSocial.follow(user.userId, profileUserId),
    );
  }

  @Delete(':profileUserId/follow')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Bỏ theo dõi một profile' })
  @ApiOkResponse({ type: ProfileFollowDto })
  async unfollow(
    @CurrentUser() user: AuthenticatedUser,
    @Param('profileUserId', ParseUUIDPipe) profileUserId: string,
  ): Promise<ProfileFollowDto> {
    return ProfileFollowDto.from(
      await this.profileSocial.unfollow(user.userId, profileUserId),
    );
  }

  @Post(':profileUserId/conversation')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary:
      'Mở chat trực tiếp từ profile; có thể yêu cầu tặng quà nếu profile quá hot',
  })
  @ApiOkResponse({ type: ConversationDto })
  async openConversation(
    @CurrentUser() user: AuthenticatedUser,
    @Param('profileUserId', ParseUUIDPipe) profileUserId: string,
  ): Promise<ConversationDto> {
    const conversation = await this.profileSocial.openConversation(
      user.userId,
      profileUserId,
    );
    return ConversationDto.from(conversation.id);
  }
}
