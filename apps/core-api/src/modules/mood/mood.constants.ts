/**
 * Idempotency key thật ghi ở DB — prefix theo `kind` + userId để 2 hành động khác nhau
 * (set vs clear) hoặc 2 user khác nhau dùng trùng key thô từ client vẫn không đụng nhau
 * (docs/05 § 5.1: chuỗi định danh nội bộ khai builder ở 1 chỗ, không literal rải rác).
 */
export function moodSetIdempotencyKey(userId: string, key: string): string {
  return `mood:set:${userId}:${key}`;
}

export function moodClearIdempotencyKey(userId: string, key: string): string {
  return `mood:clear:${userId}:${key}`;
}
