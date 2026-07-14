import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsEnum, IsInt, IsOptional, Max, Min } from 'class-validator';
import { CursorPageQueryDto } from '@litmatch/common-dtos';

import { Gender, PublicProfileDto } from '../../user';

import type { CursorPage } from '@litmatch/common-dtos';
import type { User } from '../../user';

const MIN_BROWSE_AGE = 18;
const MAX_BROWSE_AGE = 100;

/** Query browse — filter đơn phương theo preference người xem (khác filter 2 chiều lúc match). */
export class BrowseQueryDto extends CursorPageQueryDto {
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
 * Card discovery — composition, KHÔNG sửa `PublicProfileDto` (dùng chung ở Soul Match
 * reveal + Friend list, có invariant "giữ ẩn danh: không tuổi chính xác"). `ageBucket` là
 * field riêng của Discovery, tính từ `birthDate` với khoảng rộng theo config, không lộ tuổi
 * chính xác (docs/plans/2026-07-14-plan-6-tinh-nang-social-discovery.md § 6).
 */
export class DiscoveryCardDto {
  @ApiProperty({ type: PublicProfileDto }) profile!: PublicProfileDto;
  @ApiProperty({ nullable: true, type: String }) ageBucket!: string | null;

  static from(user: User, ageBucket: string | null): DiscoveryCardDto {
    const dto = new DiscoveryCardDto();
    dto.profile = PublicProfileDto.from(user);
    dto.ageBucket = ageBucket;
    return dto;
  }
}

export class DiscoveryCardsPageDto {
  @ApiProperty({ type: [DiscoveryCardDto] }) items!: DiscoveryCardDto[];
  @ApiProperty({ nullable: true, type: String }) nextCursor!: string | null;

  static from(
    page: CursorPage<{ user: User; ageBucket: string | null }>,
  ): DiscoveryCardsPageDto {
    const dto = new DiscoveryCardsPageDto();
    dto.items = page.items.map((i) =>
      DiscoveryCardDto.from(i.user, i.ageBucket),
    );
    dto.nextCursor = page.meta.nextCursor;
    return dto;
  }
}
