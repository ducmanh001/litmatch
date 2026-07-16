import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

import { Gender, SeekingGender, User } from '../entities/user.entity';

/** Profile của chính mình — KHÔNG chứa trustScore/status (dữ liệu nội bộ). */
export class MyProfileDto {
  @ApiProperty() id!: string;
  @ApiProperty() nickname!: string;
  @ApiProperty({ enum: Gender }) gender!: Gender;
  @ApiProperty({ nullable: true, type: String }) birthDate!: string | null;
  @ApiProperty({ nullable: true, type: String }) region!: string | null;
  @ApiProperty() avatarId!: string;
  @ApiProperty() isGuest!: boolean;
  @ApiProperty({ nullable: true, type: [String] }) interests!: string[] | null;
  @ApiPropertyOptional({ enum: SeekingGender, nullable: true })
  seekingGender!: SeekingGender | null;
  @ApiProperty({ nullable: true, type: Number }) seekingAgeMin!: number | null;
  @ApiProperty({ nullable: true, type: Number }) seekingAgeMax!: number | null;

  static from(user: User): MyProfileDto {
    const dto = new MyProfileDto();
    dto.id = user.id;
    dto.nickname = user.nickname;
    dto.gender = user.gender;
    dto.birthDate = user.birthDate;
    dto.region = user.region;
    dto.avatarId = user.avatarId;
    dto.isGuest = user.isGuest;
    dto.interests = user.interests;
    dto.seekingGender = user.seekingGender;
    dto.seekingAgeMin = user.seekingAgeMin;
    dto.seekingAgeMax = user.seekingAgeMax;
    return dto;
  }
}

/**
 * Profile công khai của user khác — tối thiểu, giữ ẩn danh (docs/01): không tuổi chính xác,
 * không region chi tiết. `interests` là tag hiển thị công khai (profile.html); bộ "Đang tìm
 * kiếm" là preference riêng tư, KHÔNG expose.
 */
export class PublicProfileDto {
  @ApiProperty() id!: string;
  @ApiProperty() nickname!: string;
  @ApiProperty({ enum: Gender }) gender!: Gender;
  @ApiProperty() avatarId!: string;
  @ApiProperty({ nullable: true, type: [String] }) interests!: string[] | null;

  static from(user: User): PublicProfileDto {
    const dto = new PublicProfileDto();
    dto.id = user.id;
    dto.nickname = user.nickname;
    dto.gender = user.gender;
    dto.avatarId = user.avatarId;
    dto.interests = user.interests;
    return dto;
  }
}
