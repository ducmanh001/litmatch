import { ConfigService } from '@nestjs/config';
import { SignJWT, importPKCS8 } from 'jose';

import type { CoreApiEnv } from '../../../config/env.validation';
import {
  APPLE_SERVER_API_SANDBOX_URL,
  APPLE_SERVER_API_URL,
  APPSTORE_CONNECT_AUDIENCE,
} from '../economy.constants';

/**
 * JWT bearer cho App Store Server API (ES256, ký bằng key .p8 tải từ App Store Connect).
 * Dùng cho job quét backstop "Get Refund History" (docs/services/economy-service.md § 5).
 */
export async function getAppleServerApiToken(
  config: ConfigService<CoreApiEnv, true>,
): Promise<string> {
  const issuerId = config.getOrThrow('ECONOMY_APPLE_ISSUER_ID', {
    infer: true,
  });
  const keyId = config.getOrThrow('ECONOMY_APPLE_KEY_ID', { infer: true });
  const bundleId = config.getOrThrow('ECONOMY_APPLE_BUNDLE_ID', {
    infer: true,
  });
  const privateKeyPem = config
    .getOrThrow('ECONOMY_APPLE_PRIVATE_KEY', { infer: true })
    .replace(/\\n/g, '\n');
  const key = await importPKCS8(privateKeyPem, 'ES256');
  return new SignJWT({ bid: bundleId })
    .setProtectedHeader({ alg: 'ES256', kid: keyId, typ: 'JWT' })
    .setIssuer(issuerId)
    .setIssuedAt()
    .setExpirationTime('20m')
    .setAudience(APPSTORE_CONNECT_AUDIENCE)
    .sign(key);
}

export function appleServerApiBaseUrl(
  config: ConfigService<CoreApiEnv, true>,
): string {
  return config.getOrThrow('ECONOMY_APPLE_SERVER_API_ENV', { infer: true }) ===
    'production'
    ? APPLE_SERVER_API_URL
    : APPLE_SERVER_API_SANDBOX_URL;
}
