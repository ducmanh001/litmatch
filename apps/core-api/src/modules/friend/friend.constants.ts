/** Hằng số/key builder dùng bởi ≥2 file trong module (docs/05 § 5.1). */

/** Sanity cap CỨNG ở tầng transport — giới hạn nghiệp vụ thật là config FRIEND_MESSAGE_MAX_LENGTH. */
export const MESSAGE_CONTENT_HARD_CAP = 4000;

/** Prefix theo domain cho idempotency key message (docs/05 § 5.10). */
export function messageIdempotencyKey(userId: string, key: string): string {
  return `friend:msg:${userId}:${key}`;
}
