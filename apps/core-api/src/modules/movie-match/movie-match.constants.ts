/** Hằng số/key builder dùng bởi ≥2 file trong module (docs/05 § 5.1). */

/**
 * Sanity cap CỨNG ở tầng transport (DTO) — giới hạn nghiệp vụ thật là config
 * `MOVIE_MATCH_URL_MAX_LENGTH` (kiểm tra ở service, cùng pattern
 * `MESSAGE_CONTENT_HARD_CAP` của Friend Chat).
 */
export const VIDEO_URL_HARD_CAP = 4096;

/** Advisory transaction lock serialize matcher ẩn danh — cùng kỹ thuật Palm Match. */
export const MOVIE_MATCH_ADVISORY_LOCK_KEY = 'litmatch:movie-match:pairing';

/** Whitelist reaction đúng movie-match.html — server chặn emoji ngoài danh sách. */
export const MOVIE_MATCH_REACTIONS = ['😂', '😍', '😱', '👏'] as const;

/**
 * Sanity cap CỨNG transport cho chat trong phiên — giới hạn nghiệp vụ thật là config
 * `MOVIE_MATCH_MESSAGE_MAX_LENGTH` (service check, cùng pattern Friend Chat).
 */
export const MOVIE_MESSAGE_HARD_CAP = 2000;

/** Prefix idempotency chat theo user — cùng format `friend:msg:{userId}:{key}`. */
export function movieMessageIdempotencyKey(
  userId: string,
  clientKey: string,
): string {
  return `movie:msg:${userId}:${clientKey}`;
}
