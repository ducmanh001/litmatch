import { ApiPropertyOptional } from '@nestjs/swagger';
import {
  ArrayMaxSize,
  IsArray,
  IsEnum,
  IsInt,
  IsISO8601,
  IsOptional,
  IsString,
  Length,
  Matches,
  Max,
  Min,
} from 'class-validator';

import { Gender, SeekingGender } from '../entities/user.entity';

/** "chọn tối đa 5" theo edit-profile.html — sanity cap transport, cùng vai trò MESSAGE_CONTENT_HARD_CAP. */
export const PROFILE_INTERESTS_MAX = 5;
const INTEREST_TAG_MAX_LENGTH = 32;
/** Sanity cap transport cho khoảng tuổi tìm kiếm — ràng buộc nghiệp vụ (min ≤ max) check ở service. */
const SEEKING_AGE_FLOOR = 18;
const SEEKING_AGE_CEIL = 99;

export class UpdateProfileDto {
  @ApiPropertyOptional({ example: 'Mưa Đêm' })
  @IsOptional()
  @IsString()
  @Length(2, 50)
  nickname?: string;

  @ApiPropertyOptional({ enum: Gender })
  @IsOptional()
  @IsEnum(Gender)
  gender?: Gender;

  @ApiPropertyOptional({
    example: '2000-01-31',
    description:
      'Ngày sinh ISO tự chọn — chỉ kiểm tra định dạng và không cho ngày trong tương lai',
  })
  @IsOptional()
  @IsISO8601({ strict: true })
  birthDate?: string;

  @ApiPropertyOptional({
    example: 'VN',
    description: 'Mã region ISO 3166-1 alpha-2',
  })
  @IsOptional()
  @Matches(/^[A-Z]{2}$/)
  region?: string;

  @ApiPropertyOptional({
    type: [String],
    example: ['Du lịch', 'Cà phê'],
    description: `Sở thích công khai — tối đa ${PROFILE_INTERESTS_MAX} tag; gửi mảng rỗng để xoá hết`,
  })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(PROFILE_INTERESTS_MAX)
  @IsString({ each: true })
  @Length(1, INTEREST_TAG_MAX_LENGTH, { each: true })
  interests?: string[];

  @ApiPropertyOptional({ enum: SeekingGender })
  @IsOptional()
  @IsEnum(SeekingGender)
  seekingGender?: SeekingGender;

  @ApiPropertyOptional({
    minimum: SEEKING_AGE_FLOOR,
    maximum: SEEKING_AGE_CEIL,
  })
  @IsOptional()
  @IsInt()
  @Min(SEEKING_AGE_FLOOR)
  @Max(SEEKING_AGE_CEIL)
  seekingAgeMin?: number;

  @ApiPropertyOptional({
    minimum: SEEKING_AGE_FLOOR,
    maximum: SEEKING_AGE_CEIL,
  })
  @IsOptional()
  @IsInt()
  @Min(SEEKING_AGE_FLOOR)
  @Max(SEEKING_AGE_CEIL)
  seekingAgeMax?: number;
}
