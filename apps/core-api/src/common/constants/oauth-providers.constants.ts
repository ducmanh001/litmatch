/**
 * Endpoint OIDC/JWKS cố định của Google/Apple — KHÔNG khác nhau giữa dev/staging/production
 * (khác với `ECONOMY_APPLE_SERVER_API_ENV` sandbox/production, đây là hạ tầng public cố định
 * của chính Google/Apple, đưa vào `.env` không có giá trị gì để cấu hình khác đi — docs/05 § 5.1).
 * Dùng chung giữa `auth` (verify social login ID token) và `economy` (verify webhook OIDC/JWS) —
 * đặt ở `common/` để tránh 2 module tự khai trùng, dễ lệch khi Google/Apple đổi endpoint.
 */
export const GOOGLE_JWKS_URL = 'https://www.googleapis.com/oauth2/v3/certs';
export const GOOGLE_OIDC_ISSUERS = [
  'https://accounts.google.com',
  'accounts.google.com',
] as const;

export const APPLE_OIDC_JWKS_URL = 'https://appleid.apple.com/auth/keys';
export const APPLE_OIDC_ISSUER = 'https://appleid.apple.com';
