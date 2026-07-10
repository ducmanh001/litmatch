import { ConfigService } from '@nestjs/config';
import { SignJWT, importPKCS8 } from 'jose';

/**
 * JWT bearer cho App Store Server API (ES256, ký bằng key .p8 tải từ App Store Connect).
 * Dùng cho job quét backstop "Get Refund History" (docs/services/economy-service.md § 5).
 */
export async function getAppleServerApiToken(config: ConfigService): Promise<string> {
  const issuerId = config.getOrThrow<string>('ECONOMY_APPLE_ISSUER_ID');
  const keyId = config.getOrThrow<string>('ECONOMY_APPLE_KEY_ID');
  const bundleId = config.getOrThrow<string>('ECONOMY_APPLE_BUNDLE_ID');
  const privateKeyPem = config.getOrThrow<string>('ECONOMY_APPLE_PRIVATE_KEY').replace(/\\n/g, '\n');
  const key = await importPKCS8(privateKeyPem, 'ES256');
  return new SignJWT({ bid: bundleId })
    .setProtectedHeader({ alg: 'ES256', kid: keyId, typ: 'JWT' })
    .setIssuer(issuerId)
    .setIssuedAt()
    .setExpirationTime('20m')
    .setAudience('appstoreconnect-v1')
    .sign(key);
}

export function appleServerApiBaseUrl(config: ConfigService): string {
  return config.getOrThrow<string>('ECONOMY_APPLE_SERVER_API_ENV') === 'production'
    ? 'https://api.storekit.itunes.apple.com'
    : 'https://api.storekit-sandbox.itunes.apple.com';
}
