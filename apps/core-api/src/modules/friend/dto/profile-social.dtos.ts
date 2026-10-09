import { ApiProperty } from '@nestjs/swagger';
import { ApiCursorPageMeta } from '../../../common/decorators/cursor-page-query.decorator';
import { PublicProfileDto } from '../../user';

import type { CursorPageMeta } from '@litmatch/common-dtos';
import type {
  ConnectionEntry,
  FollowCountsView,
  FollowListEntry,
  ProfileActionsView,
} from '../services/profile-social.service';

export class ProfileActionsDto {
  @ApiProperty() isFollowing!: boolean;
  @ApiProperty({ description: 'Tổng số người đang theo dõi profile' })
  followerCount!: number;
  @ApiProperty({ description: 'Tổng số profile mà user đang theo dõi' })
  followingCount!: number;
  @ApiProperty({ nullable: true, type: String }) conversationId!: string | null;
  @ApiProperty() messageAvailable!: boolean;
  @ApiProperty() requiresGift!: boolean;
  @ApiProperty({
    description:
      'Số người lần đầu mở chat trực tiếp với profile trong ngày UTC',
  })
  dailyFirstChatCount!: number;
  @ApiProperty({
    description: 'Từ người thứ N+1 trong ngày UTC cần tặng quà để mở chat',
  })
  firstChatThreshold!: number;

  static from(view: ProfileActionsView): ProfileActionsDto {
    const dto = new ProfileActionsDto();
    Object.assign(dto, view);
    return dto;
  }
}

export class ProfileFollowDto {
  @ApiProperty() following!: boolean;

  static from(following: boolean): ProfileFollowDto {
    const dto = new ProfileFollowDto();
    dto.following = following;
    return dto;
  }
}

export class FollowCountsDto {
  @ApiProperty({ description: 'Tổng số người đang theo dõi profile' })
  followerCount!: number;
  @ApiProperty({ description: 'Tổng số profile mà user đang theo dõi' })
  followingCount!: number;

  static from(view: FollowCountsView): FollowCountsDto {
    const dto = new FollowCountsDto();
    dto.followerCount = view.followerCount;
    dto.followingCount = view.followingCount;
    return dto;
  }
}

export class FollowListItemDto {
  @ApiProperty() profile!: PublicProfileDto;
  @ApiProperty({ description: 'Lần theo dõi gần nhất' }) followedAt!: Date;
  @ApiProperty({ description: 'Người xem đang theo dõi profile này' })
  isFollowing!: boolean;

  static from(
    entry: FollowListEntry,
    profile: PublicProfileDto,
    isFollowing: boolean,
  ): FollowListItemDto {
    const dto = new FollowListItemDto();
    dto.profile = profile;
    dto.followedAt = entry.followedAt;
    dto.isFollowing = isFollowing;
    return dto;
  }
}

export class FollowListPageDto {
  @ApiProperty({ type: [FollowListItemDto] }) items!: FollowListItemDto[];
  @ApiCursorPageMeta() meta!: CursorPageMeta;
}

export class FriendConnectionDto {
  @ApiProperty() profile!: PublicProfileDto;
  @ApiProperty({ description: 'Cùng "Thích" lúc ghép đôi (Friendship)' })
  isFriend!: boolean;
  @ApiProperty({ description: 'Hai bên đang theo dõi nhau' })
  isMutualFollow!: boolean;
  @ApiProperty({ description: 'Thời điểm kết nối gần nhất' }) since!: Date;

  static from(
    entry: ConnectionEntry,
    profile: PublicProfileDto,
  ): FriendConnectionDto {
    const dto = new FriendConnectionDto();
    dto.profile = profile;
    dto.isFriend = entry.isFriend;
    dto.isMutualFollow = entry.isMutualFollow;
    dto.since = entry.since;
    return dto;
  }
}
