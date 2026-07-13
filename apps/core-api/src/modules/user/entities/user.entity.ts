import { Column, Entity } from 'typeorm';
import { Roles } from '@litmatch/common-dtos';

import { BaseAppEntity } from '../../../common/entities/base.entity';

import type { Role } from '@litmatch/common-dtos';

export enum Gender {
  Unknown = 'unknown',
  Male = 'male',
  Female = 'female',
  Other = 'other',
}

export enum UserStatus {
  Active = 'active',
  Banned = 'banned',
}

@Entity({ name: 'users' })
export class User extends BaseAppEntity {
  @Column({ length: 50 })
  nickname!: string;

  @Column({ length: 10, default: Gender.Unknown })
  gender!: Gender;

  @Column({ type: 'date', nullable: true })
  birthDate!: string | null;

  @Column({ type: 'varchar', length: 10, nullable: true })
  region!: string | null;

  @Column({ length: 64 })
  avatarId!: string;

  /** Điểm tin cậy nội bộ cho matching priority (docs/06) — không expose ra API. */
  @Column({ type: 'int', default: 100 })
  trustScore!: number;

  @Column({ length: 16, default: UserStatus.Active })
  status!: UserStatus;

  @Column({ default: false })
  isGuest!: boolean;

  /**
   * RBAC (docs/12 § 12.7 Task 0) — nhúng vào access token lúc issue/refresh, không nhận từ
   * client. `type: 'varchar'` tường minh bắt buộc: `Role` là type alias (không phải class/enum
   * runtime như Gender/UserStatus) nên reflect-metadata không suy ra được cột từ TS type —
   * thiếu `type` thì TypeORM báo "Data type Object... not supported".
   */
  @Column({ type: 'varchar', length: 16, default: Roles.User })
  role!: Role;
}
