/** Hằng số/key builder dùng bởi ≥2 file trong module (docs/05 § 5.1). */

/**
 * Sanity cap CỨNG ở tầng transport (DTO) — giới hạn nghiệp vụ thật là config
 * `MOVIE_MATCH_URL_MAX_LENGTH` (kiểm tra ở service, cùng pattern
 * `MESSAGE_CONTENT_HARD_CAP` của Friend Chat).
 */
export const VIDEO_URL_HARD_CAP = 4096;
