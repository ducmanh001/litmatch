import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsEnum,
  IsInt,
  IsNumber,
  IsOptional,
  Max,
  Min,
} from 'class-validator';
import { CursorPageQueryDto } from '@litmatch/common-dtos';

import { Gender, PublicProfileDto } from '../../user';

import type { CursorPage } from '@litmatch/common-dtos';
import type { User } from '../../user';

const MIN_BROWSE_AGE = 18;
const MAX_BROWSE_AGE = 100;

/** Ghi vị trí hiện tại — server tự quantize, KHÔNG bao giờ lưu/trả lại toạ độ thô. */
export class SetLocationDto {
  @ApiProperty({ minimum: -90, maximum: 90 })
  @IsNumber()
  @Min(-90)
  @Max(90)
  lat!: number;

  @ApiProperty({ minimum: -180, maximum: 180 })
  @IsNumber()
  @Min(-180)
  @Max(180)
  lon!: number;
}

/** Bật/tắt hiển thị Nearby — tắt sẽ xoá vị trí đã lưu (docs/services/discovery-service.md § Nearby). */
export class SetNearbyVisibleDto {
  @ApiProperty()
  @IsBoolean()
  visible!: boolean;
}

export class NearbyQueryDto extends CursorPageQueryDto {
  @ApiPropertyOptional({ enum: Gender })
  @IsOptional()
  @IsEnum(Gender)
  gender?: Gender;

  @ApiPropertyOptional({ minimum: MIN_BROWSE_AGE, maximum: MAX_BROWSE_AGE })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(MIN_BROWSE_AGE)
  @Max(MAX_BROWSE_AGE)
  ageMin?: number;

  @ApiPropertyOptional({ minimum: MIN_BROWSE_AGE, maximum: MAX_BROWSE_AGE })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(MIN_BROWSE_AGE)
  @Max(MAX_BROWSE_AGE)
  ageMax?: number;
}

/**
 * Card nearby — composition riêng, KHÔNG sửa `PublicProfileDto` (cùng bất biến với Discovery
 * browse). `distanceBucket` KHÔNG bao giờ là số km/toạ độ chính xác (chống trilateration).
 */
export class NearbyCardDto {
  @ApiProperty({ type: PublicProfileDto }) profile!: PublicProfileDto;
  @ApiProperty() distanceBucket!: string;

  static from(user: User, distanceBucket: string): NearbyCardDto {
    const dto = new NearbyCardDto();
    dto.profile = PublicProfileDto.from(user);
    dto.distanceBucket = distanceBucket;
    return dto;
  }
}

export class NearbyCardsPageDto {
  @ApiProperty({ type: [NearbyCardDto] }) items!: NearbyCardDto[];
  @ApiProperty({ nullable: true, type: String }) nextCursor!: string | null;

  static from(
    page: CursorPage<{ user: User; distanceBucket: string }>,
  ): NearbyCardsPageDto {
    const dto = new NearbyCardsPageDto();
    dto.items = page.items.map((i) =>
      NearbyCardDto.from(i.user, i.distanceBucket),
    );
    dto.nextCursor = page.meta.nextCursor;
    return dto;
  }
}
