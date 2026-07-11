import { createHash, randomBytes, randomUUID } from 'node:crypto';

import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { InjectRepository } from '@nestjs/typeorm';
import { DomainException } from '@litmatch/common-exceptions';
import { IsNull, Repository } from 'typeorm';

import { AuthErrors } from '../auth.errors';
import { RefreshToken } from '../entities/refresh-token.entity';

export interface IssuedTokens {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
}

@Injectable()
export class TokenService {
  constructor(
    @InjectRepository(RefreshToken) private readonly refreshRepo: Repository<RefreshToken>,
    private readonly jwtService: JwtService,
    private readonly config: ConfigService,
  ) {}

  async issueForUser(userId: string, isGuest: boolean, familyId?: string): Promise<IssuedTokens> {
    const expiresIn = this.config.getOrThrow<number>('JWT_ACCESS_TTL_SECONDS');
    const accessToken = await this.jwtService.signAsync({ sub: userId, isGuest }, { expiresIn });

    const refreshPlain = randomBytes(48).toString('base64url');
    const ttlDays = this.config.getOrThrow<number>('AUTH_REFRESH_TTL_DAYS');
    await this.refreshRepo.save(
      this.refreshRepo.create({
        userId,
        tokenHash: this.hash(refreshPlain),
        familyId: familyId ?? randomUUID(),
        expiresAt: new Date(Date.now() + ttlDays * 24 * 3600 * 1000),
      }),
    );

    return { accessToken, refreshToken: refreshPlain, expiresIn };
  }

  /**
   * Rotation an toàn dưới race (docs/10 § 10.1.C — check-then-act phải atomic):
   * đánh dấu rotated bằng UPDATE có điều kiện `rotated_at IS NULL` — 2 request song song
   * cùng 1 token thì chỉ 1 request thắng; request thua rơi vào nhánh reuse → revoke cả family.
   */
  async rotate(refreshPlain: string): Promise<{ userId: string; tokens: IssuedTokens }> {
    const token = await this.refreshRepo.findOneBy({ tokenHash: this.hash(refreshPlain) });
    if (!token || token.revokedAt || token.expiresAt < new Date()) {
      throw new DomainException(AuthErrors.REFRESH_TOKEN_INVALID, 'Refresh token không hợp lệ', 401);
    }

    const marked = await this.refreshRepo.update(
      { id: token.id, rotatedAt: IsNull(), revokedAt: IsNull() },
      { rotatedAt: new Date() },
    );
    if (!marked.affected) {
      // Token đã rotate trước đó mà lại được dùng lần nữa → nghi bị đánh cắp, revoke cả family
      await this.revokeFamily(token.familyId);
      throw new DomainException(AuthErrors.REFRESH_TOKEN_REUSED, 'Refresh token đã bị dùng lại — phiên bị thu hồi', 401);
    }

    const tokens = await this.issueForUser(token.userId, false, token.familyId);
    return { userId: token.userId, tokens };
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

  /** SHA-256 đủ cho token 48-byte entropy cao (không phải password) — không cần bcrypt. */
  private hash(value: string): string {
    return createHash('sha256').update(value).digest('hex');
  }
}
