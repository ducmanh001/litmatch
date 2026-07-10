import { ConfigService } from '@nestjs/config';
import { SignJWT, importPKCS8 } from 'jose';

/**
 * OAuth2 JWT-bearer access token cho Google service account (Play Developer API).
 * Dùng chung cho verify IAP (iap-verifier.ts), lookup order từ RTDN, và job quét Voided Purchases.
 */
export async function getGoogleServiceAccountAccessToken(config: ConfigService, scope: string): Promise<string> {
  const email = config.getOrThrow<string>('ECONOMY_GOOGLE_SA_EMAIL');
  const privateKeyPem = config.getOrThrow<string>('ECONOMY_GOOGLE_SA_PRIVATE_KEY').replace(/\\n/g, '\n');
  const key = await importPKCS8(privateKeyPem, 'RS256');
  const assertion = await new SignJWT({ scope })
    .setProtectedHeader({ alg: 'RS256' })
    .setIssuer(email)
    .setAudience('https://oauth2.googleapis.com/token')
    .setIssuedAt()
    .setExpirationTime('5m')
    .sign(key);

  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion }),
  });
  if (!res.ok) throw new Error(`Google OAuth lỗi ${res.status}`);
  const body = (await res.json()) as { access_token: string };
  return body.access_token;
}
