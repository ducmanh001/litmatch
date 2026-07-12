import { HttpStatus, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DomainException } from '@litmatch/common-exceptions';
import { createRemoteJWKSet, jwtVerify } from 'jose';

import type { CoreApiEnv } from '../../../config/env.validation';
import {
  APPLE_OIDC_ISSUER,
  APPLE_OIDC_JWKS_URL,
  GOOGLE_JWKS_URL,
  GOOGLE_OIDC_ISSUERS,
} from '../../../common/constants/oauth-providers.constants';
import { AuthErrors } from '../auth.errors';
import { AuthProvider } from '../entities/auth-identity.entity';

export interface SocialIdentity {
  uid: string;
}

/**
 * Verify ID token của social provider Ở SERVER (docs/10 § 10.0.B — không tin token client đưa lên
 * mà không kiểm chữ ký + issuer + audience). Google/Apple đều là OIDC JWT + JWKS công khai.
 * Facebook (access token, không phải OIDC) chưa hỗ trợ ở Giai đoạn 0 — bổ sung khi cần.
 */
@Injectable()
export class SocialVerifierService {
  private readonly logger = new Logger(SocialVerifierService.name);

  private readonly jwks = {
    [AuthProvider.Google]: createRemoteJWKSet(new URL(GOOGLE_JWKS_URL)),
    [AuthProvider.Apple]: createRemoteJWKSet(new URL(APPLE_OIDC_JWKS_URL)),
  };

  constructor(private readonly config: ConfigService<CoreApiEnv, true>) {}

  async verify(provider: AuthProvider, idToken: string): Promise<SocialIdentity> {
    if (provider !== AuthProvider.Google && provider !== AuthProvider.Apple) {
      throw new DomainException(AuthErrors.SOCIAL_PROVIDER_NOT_SUPPORTED, `Provider ${provider} chưa được hỗ trợ`, HttpStatus.BAD_REQUEST);
    }

    const clientId = this.config.getOrThrow(
      provider === AuthProvider.Google ? 'AUTH_GOOGLE_CLIENT_ID' : 'AUTH_APPLE_CLIENT_ID',
      { infer: true },
    );
    if (!clientId) {
      throw new DomainException(AuthErrors.SOCIAL_PROVIDER_NOT_SUPPORTED, `Provider ${provider} chưa được cấu hình`, HttpStatus.BAD_REQUEST);
    }

    const issuer = provider === AuthProvider.Google ? [...GOOGLE_OIDC_ISSUERS] : APPLE_OIDC_ISSUER;

    try {
      const { payload } = await jwtVerify(idToken, this.jwks[provider], { issuer, audience: clientId });
      if (!payload.sub) throw new Error('missing sub');
      return { uid: payload.sub };
    } catch (err) {
      // Log lỗi gốc để phân biệt token thật sự giả mạo với lỗi mạng/JWKS rotate — response
      // cho client giữ nguyên message chung để không lộ chi tiết xác thực (docs/05 § 5.7).
      this.logger.warn(`Social token verify thất bại (${provider}): ${err}`);
      throw new DomainException(AuthErrors.SOCIAL_TOKEN_INVALID, 'ID token không hợp lệ', HttpStatus.UNAUTHORIZED);
    }
  }
}
