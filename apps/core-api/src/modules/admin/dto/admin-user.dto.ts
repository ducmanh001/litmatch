import { ApiProperty } from '@nestjs/swagger';

import { Gender, User, UserStatus } from '../../user';

import type { Role } from '@litmatch/common-dtos';

/** Profile nội bộ cho admin/moderator xem — KHÁC PublicProfileDto, có status + role. */
export class AdminUserDto {
  @ApiProperty() id!: string;
  @ApiProperty() nickname!: string;
  @ApiProperty({ enum: Gender }) gender!: Gender;
  @ApiProperty() avatarId!: string;
  @ApiProperty() isGuest!: boolean;
  @ApiProperty({ enum: UserStatus }) status!: UserStatus;
  @ApiProperty({ enum: ['user', 'moderator', 'admin'] }) role!: Role;

  static from(user: User): AdminUserDto {
    const dto = new AdminUserDto();
    dto.id = user.id;
    dto.nickname = user.nickname;
    dto.gender = user.gender;
    dto.avatarId = user.avatarId;
    dto.isGuest = user.isGuest;
    dto.status = user.status;
    dto.role = user.role;
    return dto;
  }
}
