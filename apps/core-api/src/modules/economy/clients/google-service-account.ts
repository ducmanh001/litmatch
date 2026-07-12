import { ConfigService } from '@nestjs/config';
import { SignJWT, importPKCS8 } from 'jose';

import type { CoreApiEnv } from '../../../config/env.validation';
import { GOOGLE_OAUTH_TOKEN_URL } from '../economy.constants';
import { storeApiAbortSignal } from './store-api-http';

/**
 * OAuth2 JWT-bearer access token cho Google service account (Play Developer API).
 * Dùng chung cho verify IAP (iap-verifier.ts), lookup order từ RTDN, và job quét Voided Purchases.
 */
export async function getGoogleServiceAccountAccessToken(
  config: ConfigService<CoreApiEnv, true>,
  scope: string,
): Promise<string> {
  const email = config.getOrThrow('ECONOMY_GOOGLE_SA_EMAIL', { infer: true });
  const privateKeyPem = config
    .getOrThrow('ECONOMY_GOOGLE_SA_PRIVATE_KEY', { infer: true })
    .replace(/\\n/g, '\n');
  const key = await importPKCS8(privateKeyPem, 'RS256');
  const assertion = await new SignJWT({ scope })
    .setProtectedHeader({ alg: 'RS256' })
    .setIssuer(email)
    .setAudience(GOOGLE_OAUTH_TOKEN_URL)
    .setIssuedAt()
    .setExpirationTime('5m')
    .sign(key);

  const res = await fetch(GOOGLE_OAUTH_TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion,
    }),
    signal: storeApiAbortSignal(config),
  });
  if (!res.ok) throw new Error(`Google OAuth lỗi ${res.status}`);
  const body = (await res.json()) as { access_token?: unknown };
  if (typeof body.access_token !== 'string' || body.access_token === '') {
    throw new Error('Google OAuth response thiếu access_token');
  }
  return body.access_token;
}
