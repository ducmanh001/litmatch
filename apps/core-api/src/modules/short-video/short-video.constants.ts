/** Common failure message for a production profile without vendor video adapters. */
export const VIDEO_PROVIDER_UNAVAILABLE_MESSAGE =
  'Video storage/transcode provider thật chưa được cấu hình';

/** Production must not expose upload while only dev adapters are available. */
export const VIDEO_PRODUCTION_PROVIDER_REQUIRED_MESSAGE =
  'VIDEO_UPLOAD_ENABLED=true trong production nhưng chưa có adapter storage/transcode provider thật';

/** Idempotency key tạo upload intent — theo (user, Idempotency-Key client gửi). */
export function videoUploadIdempotencyKey(
  userId: string,
  idempotencyKey: string,
): string {
  return `short-video:upload:${userId}:${idempotencyKey}`;
}
