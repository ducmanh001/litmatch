/** Hằng số/key builder dùng bởi ≥2 file trong module (docs/05 § 5.1). */

export const UQ_CALL_MATCH_SESSION = 'uq_call_sessions_match_session';

/**
 * Idempotency key billing per-minute (spec § 4): unique DB trên Transaction là chốt chặn —
 * 2 ticker instance song song cùng (call, user, phút) chỉ trừ được đúng 1 lần.
 * `minuteIndex` đếm từ 1 cho phút TÍNH PHÍ đầu tiên (sau free window).
 */
export function callTickIdempotencyKey(
  callId: string,
  userId: string,
  minuteIndex: number,
): string {
  return `calling:tick:${callId}:${userId}:${minuteIndex}`;
}
