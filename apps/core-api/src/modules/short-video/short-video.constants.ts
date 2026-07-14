/** Idempotency key tạo upload intent — theo (user, Idempotency-Key client gửi). */
export function videoUploadIdempotencyKey(
  userId: string,
  idempotencyKey: string,
): string {
  return `short-video:upload:${userId}:${idempotencyKey}`;
}
