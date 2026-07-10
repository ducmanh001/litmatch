import { createHash, randomBytes, randomUUID } from 'node:crypto';

import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import { DomainException } from '@litmatch/common-exceptions';
import { DataSource, EntityManager, IsNull, Repository } from 'typeorm';

import { User } from '../../user';

import { AuthErrors } from '../auth.errors';
import { RefreshToken } from '../entities/refresh-token.entity';

export interface IssuedTokens {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
}

type RotationOutcome =
  | { kind: 'invalid' }
  | { kind: 'reused'; familyId: string }
  | { kind: 'rotated'; userId: string; isGuest: boolean; refreshToken: string };

@Injectable()
export class TokenService {
  constructor(
    @InjectRepository(RefreshToken) private readonly refreshRepo: Repository<RefreshToken>,
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly jwtService: JwtService,
    private readonly config: ConfigService,
  ) {}

  async issueForUser(userId: string, isGuest: boolean, familyId?: string): Promise<IssuedTokens> {
    const refreshPlain = randomBytes(48).toString('base64url');
    await this.refreshRepo.save(
      this.createRefreshToken(this.refreshRepo, userId, refreshPlain, familyId ?? randomUUID()),
    );
    return this.issueAccessAndAttachRefresh(userId, isGuest, refreshPlain);
  }

  /**
   * Rotation an toàn dưới race (docs/10 § 10.1.C — check-then-act phải atomic):
   * lock token gốc, đánh dấu rotated và INSERT token con trong CÙNG transaction. Request reuse
   * phải chờ lock; khi chạy tiếp nó thấy token đã rotate và revoke cả family, bao gồm token con
   * đã commit — không còn cửa sổ "revoke trước, insert child sau" để child thoát thu hồi.
   * `isGuest` luôn đọc từ bảng users trong transaction, không nhận từ client/caller.
   */
  async rotate(refreshPlain: string): Promise<{ userId: string; tokens: IssuedTokens }> {
    const outcome = await this.dataSource.transaction((manager) => this.rotateWithinTransaction(manager, refreshPlain));

    if (outcome.kind === 'invalid') {
      throw new DomainException(AuthErrors.REFRESH_TOKEN_INVALID, 'Refresh token không hợp lệ', 401);
    }
    if (outcome.kind === 'reused') {
      throw new DomainException(AuthErrors.REFRESH_TOKEN_REUSED, 'Refresh token đã bị dùng lại — phiên bị thu hồi', 401);
    }

    const tokens = await this.issueAccessAndAttachRefresh(outcome.userId, outcome.isGuest, outcome.refreshToken);
    return { userId: outcome.userId, tokens };
  }

  /** Logout — idempotent. */
  async revoke(refreshPlain: string): Promise<void> {
    await this.refreshRepo.update(
      { tokenHash: this.hash(refreshPlain), revokedAt: IsNull() },
      { revokedAt: new Date() },
    );
  }

  async revokeFamily(familyId: string): Promise<void> {
    await this.refreshRepo.update({ familyId, revokedAt: IsNull() }, { revokedAt: new Date() });
  }

  private async rotateWithinTransaction(manager: EntityManager, refreshPlain: string): Promise<RotationOutcome> {
    const repo = manager.getRepository(RefreshToken);
    const token = await repo.findOne({
      where: { tokenHash: this.hash(refreshPlain) },
      lock: { mode: 'pessimistic_write' },
    });
    if (!token || token.expiresAt < new Date()) return { kind: 'invalid' };

    // Kiểm tra rotated trước revoked: token gốc bị revoke do reuse vẫn là tín hiệu
    // compromise; lặp lại revokeFamily là idempotent và không để child nào sống sót.
    if (token.rotatedAt) {
      await repo.update({ familyId: token.familyId, revokedAt: IsNull() }, { revokedAt: new Date() });
      return { kind: 'reused', familyId: token.familyId };
    }
    if (token.revokedAt) return { kind: 'invalid' };

    const user = await manager.getRepository(User).findOneByOrFail({ id: token.userId });
    const childPlain = randomBytes(48).toString('base64url');
    token.rotatedAt = new Date();
    await repo.save(token);
    await repo.save(this.createRefreshToken(repo, token.userId, childPlain, token.familyId));

    return { kind: 'rotated', userId: token.userId, isGuest: user.isGuest, refreshToken: childPlain };
  }

  private createRefreshToken(
    repo: Pick<Repository<RefreshToken>, 'create'>,
    userId: string,
    refreshPlain: string,
    familyId: string,
  ): RefreshToken {
    const ttlDays = this.config.getOrThrow<number>('AUTH_REFRESH_TTL_DAYS');
    return repo.create({
      userId,
      tokenHash: this.hash(refreshPlain),
      familyId,
      expiresAt: new Date(Date.now() + ttlDays * 24 * 3600 * 1000),
    });
  }

  private async issueAccessAndAttachRefresh(
    userId: string,
    isGuest: boolean,
    refreshToken: string,
  ): Promise<IssuedTokens> {
    const expiresIn = this.config.getOrThrow<number>('JWT_ACCESS_TTL_SECONDS');
    const accessToken = await this.jwtService.signAsync({ sub: userId, isGuest }, { expiresIn });
    return { accessToken, refreshToken, expiresIn };
  }

  /** SHA-256 đủ cho token 48-byte entropy cao (không phải password) — không cần bcrypt. */
  private hash(value: string): string {
    return createHash('sha256').update(value).digest('hex');
  }
}
