import { HttpStatus, Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DomainException } from '@litmatch/common-exceptions';
import { DataSource } from 'typeorm';

import { AuditLogService } from '../../common/audit/audit-log.service';
import { User, UserService } from '../user';

import { AdminErrors } from './admin.errors';

@Injectable()
export class AdminService {
  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly userService: UserService,
    private readonly auditLogService: AuditLogService,
  ) {}

  async getUser(userId: string): Promise<User> {
    return this.userService.getByIdOrThrow(userId);
  }

  /**
   * Ban + ghi audit atomic trong CÙNG transaction (docs/06: hành động nhạy cảm không được
   * "thành công 1 nửa"). Chặn tự ban chính mình — tránh admin tự khoá mất quyền truy cập.
   */
  async banUser(actorUserId: string, targetUserId: string): Promise<User> {
    if (actorUserId === targetUserId) {
      throw new DomainException(
        AdminErrors.CANNOT_BAN_SELF,
        'Không thể tự khoá tài khoản của chính mình',
        HttpStatus.FORBIDDEN,
      );
    }
    return this.dataSource.transaction(async (manager) => {
      const user = await this.userService.banUser(manager, targetUserId);
      await this.auditLogService.record(
        {
          actorUserId,
          action: 'user.banned',
          targetType: 'user',
          targetId: targetUserId,
        },
        manager,
      );
      return user;
    });
  }

  async unbanUser(actorUserId: string, targetUserId: string): Promise<User> {
    return this.dataSource.transaction(async (manager) => {
      const user = await this.userService.unbanUser(manager, targetUserId);
      await this.auditLogService.record(
        {
          actorUserId,
          action: 'user.unbanned',
          targetType: 'user',
          targetId: targetUserId,
        },
        manager,
      );
      return user;
    });
  }
}
