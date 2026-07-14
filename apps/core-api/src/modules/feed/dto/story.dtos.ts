import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsEnum,
  IsOptional,
  IsString,
  IsUrl,
  MaxLength,
} from 'class-validator';

import { Story, StoryAudience } from '../entities/story.entity';

export class CreateStoryDto {
  @ApiProperty()
  @IsUrl()
  mediaUrl!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(500)
  caption?: string;

  @ApiPropertyOptional({ enum: StoryAudience, default: StoryAudience.Friends })
  @IsOptional()
  @IsEnum(StoryAudience)
  audience?: StoryAudience;
}

export class ReplyToStoryDto {
  @ApiProperty()
  @IsString()
  @MaxLength(2000)
  content!: string;
}

export class StoryDto {
  @ApiProperty() id!: string;
  @ApiProperty() authorUserId!: string;
  @ApiProperty() mediaUrl!: string;
  @ApiProperty({ nullable: true, type: String }) caption!: string | null;
  @ApiProperty({ enum: StoryAudience }) audience!: StoryAudience;
  @ApiProperty() expiresAt!: Date;
  @ApiProperty() createdAt!: Date;

  static from(story: Story): StoryDto {
    const dto = new StoryDto();
    dto.id = story.id;
    dto.authorUserId = story.authorUserId;
    dto.mediaUrl = story.mediaUrl;
    dto.caption = story.caption;
    dto.audience = story.audience;
    dto.expiresAt = story.expiresAt;
    dto.createdAt = story.createdAt;
    return dto;
  }
}

export class StoryViewersDto {
  @ApiProperty({ type: [String] }) viewerIds!: string[];
}
