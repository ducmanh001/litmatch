import { ApiProperty } from '@nestjs/swagger';
import { Roles } from '@litmatch/common-dtos';
import { IsBoolean, IsIn } from 'class-validator';

import { AdminPermission } from '../admin.constants';

import type { Role } from '@litmatch/common-dtos';
import type { User } from '../../user';

export class AdminRolePermissionDto {
  @ApiProperty({ enum: AdminPermission }) permission!: AdminPermission;
  @ApiProperty() label!: string;
  @ApiProperty() moderator!: boolean;
  @ApiProperty() admin!: boolean;
}

export class AdminPermissionMatrixDto {
  @ApiProperty({ type: [AdminRolePermissionDto] })
  permissions!: AdminRolePermissionDto[];
}

export class SetRolePermissionDto {
  @ApiProperty()
  @IsBoolean()
  enabled!: boolean;
}

export class AdminStaffDto {
  @ApiProperty() id!: string;
  @ApiProperty() nickname!: string;
  @ApiProperty({ enum: [Roles.Moderator, Roles.Admin] })
  role!: Role;

  static from(user: User): AdminStaffDto {
    return { id: user.id, nickname: user.nickname, role: user.role };
  }
}

export class SetStaffRoleDto {
  @ApiProperty({ enum: [Roles.User, Roles.Moderator, Roles.Admin] })
  @IsIn([Roles.User, Roles.Moderator, Roles.Admin])
  role!: Role;
}
