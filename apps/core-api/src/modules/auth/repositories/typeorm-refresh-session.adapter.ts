import { Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource, EntityManager, IsNull } from 'typeorm';

import { RefreshToken } from '../entities/refresh-token.entity';
import type {
  RefreshSessionIssue,
  RefreshSessionRecord,
  RefreshSessionRotationInput,
  RefreshSessionPort,
} from '../ports/refresh-session.port';

@Injectable()
export class TypeOrmRefreshSessionAdapter implements RefreshSessionPort {
  constructor(@InjectDataSource() private readonly dataSource: DataSource) {}

  async issue(input: RefreshSessionIssue): Promise<void> {
    await this.dataSource.getRepository(RefreshToken).insert({
      userId: input.userId,
      tokenHash: input.tokenHash,
      familyId: input.familyId,
      expiresAt: input.expiresAt,
    });
  }

  async findByTokenHash(
    tokenHash: string,
  ): Promise<RefreshSessionRecord | null> {
    const session = await this.dataSource
      .getRepository(RefreshToken)
      .findOneBy({ tokenHash });
    if (!session) return null;
    return this.toRecord(session);
  }

  async rotate(
    input: RefreshSessionRotationInput,
  ): Promise<'rotated' | 'invalid' | 'reused'> {
    return this.dataSource.transaction(async (manager) => {
      const session = await manager.findOne(RefreshToken, {
        where: { id: input.tokenId },
        lock: { mode: 'pessimistic_write' },
      });
      if (!session || session.revokedAt || session.expiresAt <= new Date()) {
        return 'invalid';
      }
      if (session.rotatedAt) {
        await manager.update(
          RefreshToken,
          { familyId: session.familyId, revokedAt: IsNull() },
          { revokedAt: new Date() },
        );
        return 'reused';
      }

      const marked = await manager.update(
        RefreshToken,
        { id: session.id, rotatedAt: IsNull(), revokedAt: IsNull() },
        { rotatedAt: new Date() },
      );
      if (!marked.affected) {
        await manager.update(
          RefreshToken,
          { familyId: session.familyId, revokedAt: IsNull() },
          { revokedAt: new Date() },
        );
        return 'reused';
      }

      await manager.insert(RefreshToken, {
        userId: session.userId,
        tokenHash: input.replacement.tokenHash,
        familyId: session.familyId,
        expiresAt: input.replacement.expiresAt,
      });
      if (
        input.purgeRotatedOlderThanDays !== undefined &&
        input.purgeRotatedOlderThanDays > 0
      ) {
        // Theo họ (idx_refresh_tokens_family_id): mỗi lần xoay xoá ~1 hàng đã quá hạn giữ — chi phí tỉ lệ với hoạt động,
        // không cần index mới và không quét toàn bảng. `SKIP LOCKED` để việc dọn KHÔNG BAO GIỜ chờ khoá hàng: revokeFamily /
        // revokeForUser cập nhật các hàng của họ theo thứ tự index và có thể đang giữ một hàng cũ trong khi chờ hàng mà xoay
        // đang khoá — nếu xoay cũng chờ hàng đó sẽ thành vòng chờ (deadlock 40P01). Hàng bị bỏ qua được dọn ở lần xoay sau.
        await manager.query(
          `DELETE FROM refresh_tokens
            WHERE id IN (
              SELECT id FROM refresh_tokens
               WHERE family_id = $1
                 AND rotated_at IS NOT NULL
                 AND rotated_at < now() - make_interval(days => $2)
                 FOR UPDATE SKIP LOCKED
            )`,
          [session.familyId, input.purgeRotatedOlderThanDays],
        );
      }
      return 'rotated';
    });
  }

  async revoke(tokenHash: string): Promise<void> {
    await this.dataSource
      .getRepository(RefreshToken)
      .update({ tokenHash, revokedAt: IsNull() }, { revokedAt: new Date() });
  }

  async revokeForUser(userId: string, manager?: EntityManager): Promise<void> {
    const criteria = { userId, revokedAt: IsNull() };
    const update = { revokedAt: new Date() };
    if (manager) {
      await manager.update(RefreshToken, criteria, update);
      return;
    }
    await this.dataSource.getRepository(RefreshToken).update(criteria, update);
  }

  async revokeFamily(familyId: string): Promise<void> {
    await this.dataSource
      .getRepository(RefreshToken)
      .update({ familyId, revokedAt: IsNull() }, { revokedAt: new Date() });
  }

  private toRecord(session: RefreshToken): RefreshSessionRecord {
    return {
      id: session.id,
      userId: session.userId,
      familyId: session.familyId,
      expiresAt: session.expiresAt,
      revokedAt: session.revokedAt,
      rotatedAt: session.rotatedAt,
    };
  }
}
