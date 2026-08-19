import { ApiProperty } from '@nestjs/swagger';

import type { ProfileActionsView } from '../services/profile-social.service';

export class ProfileActionsDto {
  @ApiProperty() isFollowing!: boolean;
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
