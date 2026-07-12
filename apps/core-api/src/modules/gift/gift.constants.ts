/** Hằng số/key builder dùng bởi ≥2 file trong module (docs/05 § 5.1). */

/**
 * Idempotency key giao dịch gift (docs/05 § 5.10): prefix domain + userId người tặng +
 * key client — unique DB trên `Transaction` là chốt chặn cuối, retry không trừ tiền 2 lần.
 */
export function giftSendIdempotencyKey(
  senderUserId: string,
  clientKey: string,
): string {
  return `gift:send:${senderUserId}:${clientKey}`;
}
