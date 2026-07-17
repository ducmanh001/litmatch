import { ApiProperty } from '@nestjs/swagger';
import { CursorPageQueryDto } from '@litmatch/common-dtos';
import { Video, VideoStatus } from '../../short-video';

import type { CursorPage } from '@litmatch/common-dtos';

export class ListPendingVideosQueryDto extends CursorPageQueryDto {}

export class ListPublishedVideosQueryDto extends CursorPageQueryDto {}

export class AdminVideoDto {
  @ApiProperty() id!: string;
  @ApiProperty() authorUserId!: string;
  @ApiProperty({ enum: VideoStatus }) status!: VideoStatus;
  @ApiProperty({ nullable: true, type: String }) playbackUrl!: string | null;
  @ApiProperty({ nullable: true, type: String }) thumbnailUrl!: string | null;
  @ApiProperty({ nullable: true, type: String }) caption!: string | null;
  @ApiProperty() createdAt!: Date;

  static from(video: Video): AdminVideoDto {
    const dto = new AdminVideoDto();
    dto.id = video.id;
    dto.authorUserId = video.authorUserId;
    dto.status = video.status;
    dto.playbackUrl = video.playbackUrl;
    dto.thumbnailUrl = video.thumbnailUrl;
    dto.caption = video.caption;
    dto.createdAt = video.createdAt;
    return dto;
  }
}

export class AdminVideosPageDto {
  @ApiProperty({ type: [AdminVideoDto] }) items!: AdminVideoDto[];
  @ApiProperty({ nullable: true, type: String }) nextCursor!: string | null;

  static from(page: CursorPage<Video>): AdminVideosPageDto {
    const dto = new AdminVideosPageDto();
    dto.items = page.items.map((v) => AdminVideoDto.from(v));
    dto.nextCursor = page.meta.nextCursor;
    return dto;
  }
}
