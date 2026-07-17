import { Column, Entity, PrimaryColumn, UpdateDateColumn } from 'typeorm';

import { AdminPermission } from '../admin.constants';

import type { Role } from '@litmatch/common-dtos';

@Entity({ name: 'admin_role_permissions' })
export class AdminRolePermission {
  @PrimaryColumn({ type: 'varchar', length: 16 })
  role!: Role;

  @PrimaryColumn({ type: 'varchar', length: 64 })
  permission!: AdminPermission;

  @Column()
  enabled!: boolean;

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt!: Date;
}
