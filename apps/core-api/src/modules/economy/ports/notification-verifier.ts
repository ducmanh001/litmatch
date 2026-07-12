import { X509Certificate } from 'node:crypto';

import {
  HttpStatus,
  Injectable,
  Logger,
  OnApplicationBootstrap,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DomainException } from '@litmatch/common-exceptions';
import {
  createRemoteJWKSet,
  decodeJwt,
  decodeProtectedHeader,
  importX509,
  jwtVerify,
} from 'jose';

import type { CoreApiEnv } from '../../../config/env.validation';
import {
  GOOGLE_JWKS_URL,
  GOOGLE_OIDC_ISSUERS,
} from '../../../common/constants/oauth-providers.constants';
import { EconomyErrors } from '../economy.errors';

export interface AppleNotificationPayload {
  notificationType: string;
  subtype?: string;
  notificationUUID: string;
  data: {
    bundleId: string;
    environment: 'Sandbox' | 'Production';
    signedTransactionInfo?: string;
  };
}

export interface AppleTransactionInfo {
  transactionId: string;
  originalTransactionId: string;
  productId: string;
}

/**
 * Verify App Store Server Notifications V2 (docs/services/economy-service.md § 5) —
 * KHÔNG tin payload chưa verify chữ ký (docs/10 § 10.0.B).
 */
export abstract class AppleNotificationVerifier {
  abstract verify(signedPayload: string): Promise<AppleNotificationPayload>;
  abstract decodeTransactionInfo(
    signedTransactionInfo: string,
  ): AppleTransactionInfo;
}

/** Dev/test: KHÔNG verify chữ ký, chỉ decode — chặn cứng ở production giống DevIapVerifier. */
@Injectable()
export class DevAppleNotificationVerifier
  extends AppleNotificationVerifier
  implements OnApplicationBootstrap
{
  private readonly logger = new Logger(DevAppleNotificationVerifier.name);

  constructor(private readonly config: ConfigService<CoreApiEnv, true>) {
    super();
  }

  onApplicationBootstrap(): void {
    if (this.config.get('NODE_ENV', { infer: true }) === 'production') {
      throw new Error(
        'DevAppleNotificationVerifier không được dùng ở production — set ECONOMY_APPLE_WEBHOOK_VERIFIER=store',
      );
    }
  }

  async verify(signedPayload: string): Promise<AppleNotificationPayload> {
    this.logger.warn(
      '[DEV-ONLY] chấp nhận Apple notification KHÔNG verify chữ ký',
    );
    return decodeJwt(signedPayload) as unknown as AppleNotificationPayload;
  }

  decodeTransactionInfo(signedTransactionInfo: string): AppleTransactionInfo {
    return decodeJwt(signedTransactionInfo) as unknown as AppleTransactionInfo;
  }
}

/**
 * Verify chữ ký JWS (ES256) + chain x5c lên tới Apple Root CA đáng tin (docs § 5).
 * Cần `ECONOMY_APPLE_ROOT_CA_PEM` = PEM cert "Apple Root CA - G3" tải từ
 * https://www.apple.com/certificateauthority/ (KHÔNG hardcode trong code — docs/05 § 5.1).
 *
 * signedTransactionInfo lồng bên trong data đã được coi là đáng tin nếu signedPayload ngoài
 * verify chain thành công — vì toàn bộ chuỗi JSON (bao gồm chuỗi signedTransactionInfo) đã nằm
 * trong phạm vi chữ ký ngoài, không ai chỉnh sửa được nó mà không phá chữ ký ngoài.
 */
@Injectable()
export class StoreAppleNotificationVerifier extends AppleNotificationVerifier {
  constructor(private readonly config: ConfigService<CoreApiEnv, true>) {
    super();
  }

  async verify(signedPayload: string): Promise<AppleNotificationPayload> {
    const header = decodeProtectedHeader(signedPayload) as { x5c?: string[] };
    if (!header.x5c || header.x5c.length === 0) {
      throw new DomainException(
        EconomyErrors.WEBHOOK_SIGNATURE_INVALID,
        'Thiếu x5c trong JWS header',
        HttpStatus.UNAUTHORIZED,
      );
    }

    const certs = header.x5c.map(
      (b64) => new X509Certificate(Buffer.from(b64, 'base64')),
    );
    const trustedRootPem = this.config
      .getOrThrow('ECONOMY_APPLE_ROOT_CA_PEM', { infer: true })
      .replace(/\\n/g, '\n');
    const trustedRoot = new X509Certificate(trustedRootPem);
    if (!this.chainIsTrusted(certs, trustedRoot)) {
      throw new DomainException(
        EconomyErrors.WEBHOOK_SIGNATURE_INVALID,
        'Chain chứng chỉ Apple không hợp lệ',
        HttpStatus.UNAUTHORIZED,
      );
    }

    // Khoá cứng ES256 (không đọc `alg` từ header — đó là dữ liệu CHƯA xác thực, không dùng để
    // quyết định thuật toán verify — chống tấn công algorithm confusion, docs/10 § 10.0.B).
    const leafPublicKey = await importX509(certs[0].toString(), 'ES256');
    const { payload } = await jwtVerify(signedPayload, leafPublicKey, {
      algorithms: ['ES256'],
    });
    return payload as unknown as AppleNotificationPayload;
  }

  decodeTransactionInfo(signedTransactionInfo: string): AppleTransactionInfo {
    // Đã nằm trong phạm vi chữ ký của signedPayload ngoài (xem docstring class) — chỉ cần decode.
    return decodeJwt(signedTransactionInfo) as unknown as AppleTransactionInfo;
  }

  /** leaf → ... → intermediate cuối phải được ký bởi trustedRoot (hoặc chính là trustedRoot), và mọi cert trong chain còn hạn. */
  private chainIsTrusted(
    certs: X509Certificate[],
    trustedRoot: X509Certificate,
  ): boolean {
    const now = new Date();
    if (
      certs.some(
        (c) => now < new Date(c.validFrom) || now > new Date(c.validTo),
      )
    )
      return false;
    for (let i = 0; i < certs.length - 1; i++) {
      if (
        !certs[i].checkIssued(certs[i + 1]) ||
        !certs[i].verify(certs[i + 1].publicKey)
      )
        return false;
    }
    const last = certs[certs.length - 1];
    if (last.fingerprint256 === trustedRoot.fingerprint256) return true;
    return last.checkIssued(trustedRoot) && last.verify(trustedRoot.publicKey);
  }
}

export interface GoogleRtdnEnvelope {
  message: { data: string; messageId: string; publishTime: string };
  subscription: string;
}

/** Verify Pub/Sub push envelope (Google RTDN — docs § 5) rồi trả JSON RTDN đã decode. */
export abstract class GoogleRtdnVerifier {
  abstract verify(
    envelope: GoogleRtdnEnvelope,
    authorizationHeader: string | undefined,
  ): Promise<Record<string, unknown>>;
}

/** Dev/test: KHÔNG verify OIDC token — chặn cứng ở production. */
@Injectable()
export class DevGoogleRtdnVerifier
  extends GoogleRtdnVerifier
  implements OnApplicationBootstrap
{
  private readonly logger = new Logger(DevGoogleRtdnVerifier.name);

  constructor(private readonly config: ConfigService<CoreApiEnv, true>) {
    super();
  }

  onApplicationBootstrap(): void {
    if (this.config.get('NODE_ENV', { infer: true }) === 'production') {
      throw new Error(
        'DevGoogleRtdnVerifier không được dùng ở production — set ECONOMY_GOOGLE_RTDN_VERIFIER=store',
      );
    }
  }

  async verify(envelope: GoogleRtdnEnvelope): Promise<Record<string, unknown>> {
    this.logger.warn(
      '[DEV-ONLY] chấp nhận Google RTDN KHÔNG verify OIDC token',
    );
    return JSON.parse(
      Buffer.from(envelope.message.data, 'base64').toString('utf8'),
    );
  }
}

const GOOGLE_JWKS = createRemoteJWKSet(new URL(GOOGLE_JWKS_URL));

/**
 * Verify JWT trong header Authorization theo hướng dẫn Pub/Sub push OIDC token của Google:
 * iss = accounts.google.com, aud = URL endpoint đã cấu hình khi tạo push subscription,
 * email = service account đã cấu hình cho subscription đó (docs § 5).
 */
@Injectable()
export class StoreGoogleRtdnVerifier extends GoogleRtdnVerifier {
  constructor(private readonly config: ConfigService<CoreApiEnv, true>) {
    super();
  }

  async verify(
    envelope: GoogleRtdnEnvelope,
    authorizationHeader: string | undefined,
  ): Promise<Record<string, unknown>> {
    if (!authorizationHeader?.startsWith('Bearer ')) {
      throw new DomainException(
        EconomyErrors.WEBHOOK_SIGNATURE_INVALID,
        'Thiếu Bearer token',
        HttpStatus.UNAUTHORIZED,
      );
    }
    const token = authorizationHeader.slice('Bearer '.length);
    const audience = this.config.getOrThrow('ECONOMY_GOOGLE_RTDN_AUDIENCE', {
      infer: true,
    });
    const expectedEmail = this.config.getOrThrow(
      'ECONOMY_GOOGLE_RTDN_SERVICE_ACCOUNT_EMAIL',
      { infer: true },
    );

    const { payload } = await jwtVerify(token, GOOGLE_JWKS, {
      issuer: [...GOOGLE_OIDC_ISSUERS],
      audience,
    });
    if (
      payload['email'] !== expectedEmail ||
      payload['email_verified'] !== true
    ) {
      throw new DomainException(
        EconomyErrors.WEBHOOK_SIGNATURE_INVALID,
        'OIDC token không đúng service account',
        HttpStatus.UNAUTHORIZED,
      );
    }

    return JSON.parse(
      Buffer.from(envelope.message.data, 'base64').toString('utf8'),
    );
  }
}
