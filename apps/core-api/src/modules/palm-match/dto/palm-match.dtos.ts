import { ApiProperty } from '@nestjs/swagger';
import { IsEnum, IsOptional, IsString, MaxLength } from 'class-validator';

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
