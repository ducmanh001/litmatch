import { ApiPropertyOptional, ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import { Roles } from '@litmatch/common-dtos';

import { UserStatus } from '../../user';

import { AdminUserDto } from './admin-user.dto';

import type { Role } from '@litmatch/common-dtos';
import type { UserPage } from '../../user';

/** Query cho GET /admin/users — offset OK vì list nhỏ (docs/05 § 5.4). */
export class ListUsersQueryDto {
  @ApiPropertyOptional({ enum: UserStatus })
  @IsOptional()
  @IsEnum(UserStatus)
  status?: UserStatus;

  @ApiPropertyOptional({ enum: Object.values(Roles) })
  @IsOptional()
  @IsEnum(Roles)
  role?: Role;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(50)
  nickname?: string;

  @ApiPropertyOptional({ default: 20 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit = 20;

  @ApiPropertyOptional({ default: 0 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  offset = 0;
}

export class AdminUsersPageDto {
  @ApiProperty({ type: [AdminUserDto] }) items!: AdminUserDto[];
  @ApiProperty() total!: number;

  static from(page: UserPage): AdminUsersPageDto {
    const dto = new AdminUsersPageDto();
    dto.items = page.items.map(AdminUserDto.from);
    dto.total = page.total;
    return dto;
  }
}
