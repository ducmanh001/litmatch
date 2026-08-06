import { createHash, randomBytes, randomUUID } from 'node:crypto';

import { HttpStatus, Inject, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { DomainException } from '@litmatch/common-exceptions';

import { UserService } from '../../user';

import type { AccessTokenPayload, Role } from '@litmatch/common-dtos';
import type { CoreApiEnv } from '../../../config/env.validation';
import { REFRESH_TOKEN_BYTES } from '../auth.constants';
import { AuthErrors } from '../auth.errors';
import { RefreshSessionPort } from '../ports/refresh-session.port';

export interface IssuedTokens {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
}

@Injectable()
export class TokenService {
  constructor(
    @Inject(RefreshSessionPort)
    private readonly refreshSessions: RefreshSessionPort,
    private readonly jwtService: JwtService,
    private readonly config: ConfigService<CoreApiEnv, true>,
    private readonly userService: UserService,
  ) {}

  async issueForUser(
    userId: string,
    isGuest: boolean,
    role: Role,
    familyId?: string,
  ): Promise<IssuedTokens> {
    const expiresIn = this.config.getOrThrow('JWT_ACCESS_TTL_SECONDS', {
      infer: true,
    });
    const payload: AccessTokenPayload = {
      sub: userId,
      isGuest,
      role,
      jti: randomUUID(),
    };
    const accessToken = await this.jwtService.signAsync(payload, { expiresIn });

    const refreshPlain = randomBytes(REFRESH_TOKEN_BYTES).toString('base64url');
    const ttlDays = this.config.getOrThrow('AUTH_REFRESH_TTL_DAYS', {
      infer: true,
    });
    await this.refreshSessions.issue({
      userId,
      tokenHash: this.hash(refreshPlain),
      familyId: familyId ?? randomUUID(),
      expiresAt: this.refreshExpiresAt(ttlDays),
    });

    return { accessToken, refreshToken: refreshPlain, expiresIn };
  }

  /**
   * Rotation an toàn dưới race (docs/10 § 10.1.C — check-then-act phải atomic):
   * đánh dấu rotated bằng UPDATE có điều kiện `rotated_at IS NULL` — 2 request song song
   * cùng 1 token thì chỉ 1 request thắng; request thua rơi vào nhánh reuse → revoke cả family.
   */
  async rotate(
    refreshPlain: string,
  ): Promise<{ userId: string; tokens: IssuedTokens }> {
    const session = await this.refreshSessions.findByTokenHash(
      this.hash(refreshPlain),
    );
    if (!session || session.revokedAt || session.expiresAt <= new Date()) {
      throw this.invalidRefreshToken();
    }

    const ttlDays = this.config.getOrThrow('AUTH_REFRESH_TTL_DAYS', {
      infer: true,
    });
    const user = await this.userService.getByIdOrThrow(session.userId);
    const tokens = await this.issueTokens(user.id, user.isGuest, user.role);
    const result = await this.refreshSessions.rotate({
      tokenId: session.id,
      replacement: {
        tokenHash: this.hash(tokens.refreshToken),
        expiresAt: this.refreshExpiresAt(ttlDays),
      },
    });

    if (result === 'invalid') {
      throw this.invalidRefreshToken();
    }
    if (result === 'reused') {
      throw new DomainException(
        AuthErrors.REFRESH_TOKEN_REUSED,
        'Refresh token đã bị dùng lại — phiên bị thu hồi',
        HttpStatus.UNAUTHORIZED,
      );
    }

    return { userId: session.userId, tokens };
  }

  /** Logout — idempotent. */
  async revoke(refreshPlain: string): Promise<void> {
    await this.refreshSessions.revoke(this.hash(refreshPlain));
  }

  async revokeFamily(familyId: string): Promise<void> {
    await this.refreshSessions.revokeFamily(familyId);
  }

  private async issueTokens(
    userId: string,
    isGuest: boolean,
    role: Role,
  ): Promise<IssuedTokens> {
    const expiresIn = this.config.getOrThrow('JWT_ACCESS_TTL_SECONDS', {
      infer: true,
    });
    const accessToken = await this.jwtService.signAsync(
      {
        sub: userId,
        isGuest,
        role,
        jti: randomUUID(),
      } satisfies AccessTokenPayload,
      { expiresIn },
    );
    return {
      accessToken,
      refreshToken: randomBytes(REFRESH_TOKEN_BYTES).toString('base64url'),
      expiresIn,
    };
  }

  private refreshExpiresAt(ttlDays: number): Date {
    return new Date(Date.now() + ttlDays * 24 * 3600 * 1000);
  }

  private invalidRefreshToken(): DomainException {
    return new DomainException(
      AuthErrors.REFRESH_TOKEN_INVALID,
      'Refresh token không hợp lệ',
      HttpStatus.UNAUTHORIZED,
    );
  }

  /** SHA-256 đủ cho token REFRESH_TOKEN_BYTES-byte entropy cao (không phải password). */
  private hash(value: string): string {
    return createHash('sha256').update(value).digest('hex');
  }
}
