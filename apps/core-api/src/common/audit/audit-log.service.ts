import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { EntityManager, Repository } from 'typeorm';

import { AdminAuditLog } from './audit-log.entity';

@Injectable()
export class AuditLogService {
  constructor(
    @InjectRepository(AdminAuditLog)
    private readonly repo: Repository<AdminAuditLog>,
  ) {}

  /**
   * Ghi 1 dòng audit — chỉ INSERT, không có method update/delete nào ở class này (bất biến
   * ngay từ API, DB trigger là chốt chặn thứ 2). Truyền `manager` khi cần ghi CÙNG transaction
   * với hành động nghiệp vụ (vd ban user) để atomic — không tách 2 write rời nhau.
   */
  async record(
    input: {
      actorUserId: string;
      action: string;
      targetType: string;
      targetId: string;
      metadata?: Record<string, unknown>;
    },
    manager?: EntityManager,
  ): Promise<void> {
    const repo = manager?.getRepository(AdminAuditLog) ?? this.repo;
    await repo.save(
      repo.create({
        actorUserId: input.actorUserId,
        action: input.action,
        targetType: input.targetType,
        targetId: input.targetId,
        metadata: input.metadata ?? null,
      }),
    );
  }

  async listRecent(limit: number): Promise<AdminAuditLog[]> {
    return this.repo.find({ order: { createdAt: 'DESC' }, take: limit });
  }
}
