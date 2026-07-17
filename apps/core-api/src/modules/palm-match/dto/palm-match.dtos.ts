import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsOptional, IsString, MaxLength } from 'class-validator';

import {
  PalmMatchOutcome,
  PalmMatchRating,
} from '../entities/palm-match-session.entity';
import { PalmMatchCategory } from '../entities/palm-reading-template.entity';

/**
 * `targetName` validate độ dài ở decorator với hằng số an toàn (`class-validator` yêu cầu literal
 * ở decorator) — giới hạn thật theo config `PALM_MATCH_TARGET_NAME_MAX_LENGTH` được service kiểm
 * tra lại (docs/05 § 5.1: không hardcode threshold nghiệp vụ trong code).
 */
const TARGET_NAME_DECORATOR_MAX_LENGTH = 256;

export class PalmMatchReadingQueryDto {
  @ApiProperty({ enum: PalmMatchCategory })
  @IsEnum(PalmMatchCategory)
  category!: PalmMatchCategory;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  @MaxLength(TARGET_NAME_DECORATOR_MAX_LENGTH)
  targetName?: string;
}

export class PalmMatchReadingDto {
  @ApiProperty({ enum: PalmMatchCategory })
  category!: PalmMatchCategory;

  @ApiProperty()
  content!: string;

  @ApiProperty({ description: 'Ngày server (UTC, YYYY-MM-DD) dùng làm seed' })
  forDate!: string;
}

export enum PalmMatchClientState {
  Idle = 'idle',
  Queued = 'queued',
  Active = 'active',
  Completed = 'completed',
}

export class PalmZodiacSignDto {
  @ApiProperty()
  key!: string;

  @ApiProperty()
  symbol!: string;

  @ApiProperty()
  name!: string;
}

/** Một shape duy nhất để poll/reload không phải ghép business state ở client. */
export class PalmMatchStateDto {
  @ApiProperty({ enum: PalmMatchClientState })
  state!: PalmMatchClientState;

  @ApiPropertyOptional({ format: 'uuid' })
  sessionId?: string;

  @ApiPropertyOptional({ format: 'date-time' })
  queuedAt?: string;

  @ApiPropertyOptional({ format: 'date-time' })
  expiresAt?: string;

  @ApiPropertyOptional()
  myFlipped?: boolean;

  @ApiPropertyOptional()
  opponentFlipped?: boolean;

  @ApiPropertyOptional({ type: PalmZodiacSignDto })
  mySign?: PalmZodiacSignDto;

  @ApiPropertyOptional({ type: PalmZodiacSignDto })
  opponentSign?: PalmZodiacSignDto;

  @ApiPropertyOptional({ minimum: 60, maximum: 99 })
  compatibilityPercent?: number;

  @ApiPropertyOptional()
  fortune?: string;

  @ApiPropertyOptional({ enum: PalmMatchRating })
  myRating?: PalmMatchRating;

  @ApiPropertyOptional({ enum: PalmMatchOutcome })
  outcome?: PalmMatchOutcome;

  @ApiPropertyOptional({ description: 'Chỉ xuất hiện sau mutual-like' })
  partnerUserId?: string;
}

export class RatePalmMatchDto {
  @ApiProperty({ enum: PalmMatchRating })
  @IsEnum(PalmMatchRating)
  rating!: PalmMatchRating;
}
