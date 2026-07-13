/** Hằng số/key builder dùng bởi ≥2 file trong module (docs/05 § 5.1). */

/**
 * Idempotency key mua item avatar (docs/05 § 5.10): prefix domain + userId + key client — unique
 * DB trên `Transaction` (economy) là chốt chặn cuối, retry không trừ tiền 2 lần.
 */
export function avatarBuyIdempotencyKey(
  userId: string,
  clientKey: string,
): string {
  return `avatar:buy:${userId}:${clientKey}`;
}
