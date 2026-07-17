/**
 * Danh sách field cấm log, đặt tập trung 1 chỗ (docs/05 § 5.7) —
 * mọi app dùng chung, không tự nhớ ở từng chỗ.
 */
export const REDACT_PATHS: string[] = [
  'req.headers.authorization',
  'req.headers.cookie',
  'res.headers["set-cookie"]',
  // body/payload nhạy cảm — pino redact hỗ trợ wildcard 1 cấp
  'req.body.password',
  'req.body.otp',
  'req.body.code',
  'req.body.token',
  'req.body.refreshToken',
  'req.body.accessToken',
  'req.body.idToken',
  'req.body.receipt',
  'req.body.phone',
  'req.body.lat',
  'req.body.lon',
  'req.body.latitude',
  'req.body.longitude',
  '*.password',
  '*.otp',
  '*.token',
  '*.refreshToken',
  '*.accessToken',
  '*.idToken',
  '*.receipt',
  '*.phone',
  '*.lat',
  '*.lon',
  '*.latitude',
  '*.longitude',
  '*.latQuantized',
  '*.lonQuantized',
];
