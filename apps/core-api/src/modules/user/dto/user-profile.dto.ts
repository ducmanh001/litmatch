import { ApiProperty } from '@nestjs/swagger';

import { Gender, User } from '../entities/user.entity';

/** Profile của chính mình — KHÔNG chứa trustScore/status (dữ liệu nội bộ). */
export class MyProfileDto {
  @ApiProperty() id!: string;
  @ApiProperty() nickname!: string;
  @ApiProperty({ enum: Gender }) gender!: Gender;
  @ApiProperty({ nullable: true, type: String }) birthDate!: string | null;
  @ApiProperty({ nullable: true, type: String }) region!: string | null;
  @ApiProperty() avatarId!: string;
  @ApiProperty() isGuest!: boolean;

  static from(user: User): MyProfileDto {
    const dto = new MyProfileDto();
    dto.id = user.id;
    dto.nickname = user.nickname;
    dto.gender = user.gender;
    dto.birthDate = user.birthDate;
    dto.region = user.region;
    dto.avatarId = user.avatarId;
    dto.isGuest = user.isGuest;
    return dto;
  }
}

/** Profile công khai của user khác — tối thiểu, giữ ẩn danh (docs/01): không tuổi chính xác, không region chi tiết. */
export class PublicProfileDto {
  @ApiProperty() id!: string;
  @ApiProperty() nickname!: string;
  @ApiProperty({ enum: Gender }) gender!: Gender;
  @ApiProperty() avatarId!: string;

  static from(user: User): PublicProfileDto {
    const dto = new PublicProfileDto();
    dto.id = user.id;
    dto.nickname = user.nickname;
    dto.gender = user.gender;
    dto.avatarId = user.avatarId;
    return dto;
  }
}
