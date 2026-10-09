import {
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { CursorPageQueryDto } from '@litmatch/common-dtos';

import { ApiCursorPageQuery } from '../../../common/decorators/cursor-page-query.decorator';
import { CurrentUser } from '../../../common/decorators/current-user.decorator';
import { PublicProfileDto, UserService } from '../../user';
import { ConversationDto } from '../dto/friend.dtos';
import {
  FollowCountsDto,
  FollowListItemDto,
  FollowListPageDto,
  ProfileActionsDto,
  ProfileFollowDto,
} from '../dto/profile-social.dtos';
import { ProfileSocialService } from '../services/profile-social.service';

import type { AuthenticatedUser } from '../../../common/decorators/current-user.decorator';
import type { CursorPage } from '@litmatch/common-dtos';
import type { FollowListEntry } from '../services/profile-social.service';

@ApiTags('profiles')
@ApiBearerAuth()
@Controller('profiles')
export class ProfileSocialController {
  constructor(
    private readonly profileSocial: ProfileSocialService,
    private readonly userService: UserService,
  ) {}

  @Get(':profileUserId/follow-counts')
  @ApiOperation({
    summary:
      'Số người theo dõi và đang theo dõi của một profile (gồm cả chính mình)',
  })
  @ApiOkResponse({ type: FollowCountsDto })
  async getFollowCounts(
    @CurrentUser() user: AuthenticatedUser,
    @Param('profileUserId', ParseUUIDPipe) profileUserId: string,
  ): Promise<FollowCountsDto> {
    return FollowCountsDto.from(
      await this.profileSocial.getFollowCounts(user.userId, profileUserId),
    );
  }

  @Get(':profileUserId/followers')
  @ApiOperation({
    summary:
      'Danh sách người theo dõi profile (cursor, mới theo dõi nhất trước)',
  })
  @ApiCursorPageQuery()
  @ApiOkResponse({ type: FollowListPageDto })
  async listFollowers(
    @CurrentUser() user: AuthenticatedUser,
    @Param('profileUserId', ParseUUIDPipe) profileUserId: string,
    @Query() query: CursorPageQueryDto,
  ): Promise<FollowListPageDto> {
    const page = await this.profileSocial.listFollowers(
      user.userId,
      profileUserId,
      query.limit,
      query.cursor,
    );
    return this.toFollowListPage(user.userId, page);
  }

  @Get(':profileUserId/following')
  @ApiOperation({
    summary:
      'Danh sách profile mà user đang theo dõi (cursor, mới theo dõi nhất trước)',
  })
  @ApiCursorPageQuery()
  @ApiOkResponse({ type: FollowListPageDto })
  async listFollowing(
    @CurrentUser() user: AuthenticatedUser,
    @Param('profileUserId', ParseUUIDPipe) profileUserId: string,
    @Query() query: CursorPageQueryDto,
  ): Promise<FollowListPageDto> {
    const page = await this.profileSocial.listFollowing(
      user.userId,
      profileUserId,
      query.limit,
      query.cursor,
    );
    return this.toFollowListPage(user.userId, page);
  }

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

  /**
   * Gắn profile công khai vào từng dòng; user không còn tồn tại bị bỏ qua thay vì làm hỏng
   * cả trang (service đã lọc user banned/bị block trước khi tới đây).
   */
  private async toFollowListPage(
    viewerUserId: string,
    page: CursorPage<FollowListEntry>,
  ): Promise<FollowListPageDto> {
    const profiles = await this.userService.findByIds(
      page.items.map((entry) => entry.userId),
    );
    const profileById = new Map(
      profiles.map((profile) => [profile.id, profile]),
    );
    const followedIds = await this.profileSocial.filterFollowedIds(
      viewerUserId,
      page.items.map((entry) => entry.userId),
    );
    const items = page.items.flatMap((entry) => {
      const profile = profileById.get(entry.userId);
      return profile
        ? [
            FollowListItemDto.from(
              entry,
              PublicProfileDto.from(profile),
              followedIds.has(entry.userId),
            ),
          ]
        : [];
    });
    return { items, meta: page.meta };
  }
}
