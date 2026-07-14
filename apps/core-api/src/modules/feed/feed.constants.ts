/** Hằng số/key builder dùng bởi ≥2 file trong module (docs/05 § 5.1). */

/** Prefix theo domain cho idempotency key tạo bài (docs/05 § 5.10). */
export function feedPostIdempotencyKey(userId: string, key: string): string {
  return `feed:post:${userId}:${key}`;
}

/** Prefix theo domain cho idempotency key tạo story. */
export function storyIdempotencyKey(userId: string, key: string): string {
  return `feed:story:${userId}:${key}`;
}
