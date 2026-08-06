import { Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource, IsNull } from 'typeorm';

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
      return 'rotated';
    });
  }

  async revoke(tokenHash: string): Promise<void> {
    await this.dataSource
      .getRepository(RefreshToken)
      .update({ tokenHash, revokedAt: IsNull() }, { revokedAt: new Date() });
  }

  async revokeForUser(userId: string): Promise<void> {
    await this.dataSource
      .getRepository(RefreshToken)
      .update({ userId, revokedAt: IsNull() }, { revokedAt: new Date() });
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
