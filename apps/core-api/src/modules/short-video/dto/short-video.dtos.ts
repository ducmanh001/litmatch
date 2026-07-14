import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsEnum,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  MaxLength,
  Min,
} from 'class-validator';
import { CursorPageQueryDto } from '@litmatch/common-dtos';

import { Video, VideoStatus } from '../entities/video.entity';
import { VideoComment } from '../entities/video-comment.entity';
import { ReportReason } from '../../safety';

export class CreateUploadIntentDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  caption?: string;
}

export class UploadIntentDto {
  @ApiProperty() videoId!: string;
  @ApiProperty() uploadUrl!: string;

  static from(video: Video, uploadUrl: string): UploadIntentDto {
    const dto = new UploadIntentDto();
    dto.videoId = video.id;
    dto.uploadUrl = uploadUrl;
    return dto;
  }
}

export class VideoDto {
  @ApiProperty() id!: string;
  @ApiProperty() authorUserId!: string;
  @ApiProperty({ enum: VideoStatus }) status!: VideoStatus;
  @ApiProperty({ nullable: true, type: String }) playbackUrl!: string | null;
  @ApiProperty({ nullable: true, type: String }) thumbnailUrl!: string | null;
  @ApiProperty({ nullable: true, type: String }) caption!: string | null;
  @ApiProperty({ nullable: true, type: Number }) durationSeconds!:
    number | null;
  @ApiProperty() viewCount!: number;
  @ApiProperty() likeCount!: number;
  @ApiProperty() commentCount!: number;
  @ApiProperty() createdAt!: Date;

  static from(video: Video): VideoDto {
    const dto = new VideoDto();
    dto.id = video.id;
    dto.authorUserId = video.authorUserId;
    dto.status = video.status;
    dto.playbackUrl = video.playbackUrl;
    dto.thumbnailUrl = video.thumbnailUrl;
    dto.caption = video.caption;
    dto.durationSeconds = video.durationSeconds;
    dto.viewCount = video.viewCount;
    dto.likeCount = video.likeCount;
    dto.commentCount = video.commentCount;
    dto.createdAt = video.createdAt;
    return dto;
  }
}

export class ListVideosQueryDto extends CursorPageQueryDto {
  @ApiPropertyOptional({ enum: ['recent', 'ranked'], default: 'recent' })
  @IsOptional()
  @IsIn(['recent', 'ranked'])
  sort?: 'recent' | 'ranked';
}

export class VideosPageDto {
  @ApiProperty({ type: [VideoDto] }) items!: VideoDto[];
  @ApiProperty({ nullable: true, type: String }) nextCursor!: string | null;

  static from(page: {
    items: Video[];
    meta: { nextCursor: string | null };
  }): VideosPageDto {
    const dto = new VideosPageDto();
    dto.items = page.items.map((v) => VideoDto.from(v));
    dto.nextCursor = page.meta.nextCursor;
    return dto;
  }
}

export class RecordViewDto {
  @ApiProperty({ minimum: 0 })
  @Type(() => Number)
  @IsInt()
  @Min(0)
  watchTimeMs!: number;
}

export class CreateVideoCommentDto {
  @ApiProperty()
  @IsString()
  content!: string;
}

export class VideoCommentDto {
  @ApiProperty() id!: string;
  @ApiProperty() videoId!: string;
  @ApiProperty() authorUserId!: string;
  @ApiProperty() content!: string;
  @ApiProperty() createdAt!: Date;

  static from(comment: VideoComment): VideoCommentDto {
    const dto = new VideoCommentDto();
    dto.id = comment.id;
    dto.videoId = comment.videoId;
    dto.authorUserId = comment.authorUserId;
    dto.content = comment.content;
    dto.createdAt = comment.createdAt;
    return dto;
  }
}

export class VideoCommentsPageDto {
  @ApiProperty({ type: [VideoCommentDto] }) items!: VideoCommentDto[];
  @ApiProperty({ nullable: true, type: String }) nextCursor!: string | null;

  static from(page: {
    items: VideoComment[];
    meta: { nextCursor: string | null };
  }): VideoCommentsPageDto {
    const dto = new VideoCommentsPageDto();
    dto.items = page.items.map((c) => VideoCommentDto.from(c));
    dto.nextCursor = page.meta.nextCursor;
    return dto;
  }
}

export class ReactionStatusDto {
  @ApiProperty() liked!: boolean;
  @ApiProperty() likeCount!: number;
}

export class ReportVideoDto {
  @ApiProperty({ enum: ReportReason })
  @IsEnum(ReportReason)
  reason!: ReportReason;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  description?: string;
}
