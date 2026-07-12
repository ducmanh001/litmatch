/** Mã lỗi của Soul Match module (docs/05 § 5.5) — format SOUL_MATCH_SUBJECT_REASON. */
export const SoulMatchErrors = {
  /** Session không tồn tại HOẶC caller không phải thành viên — gộp 1 mã, không làm oracle dò sessionId. */
  SESSION_NOT_FOUND: 'SOUL_MATCH_SESSION_NOT_FOUND',
  /** Phòng chưa mở (chưa đủ 2 confirm / không phải soul) hoặc đã qua phase cho phép. */
  CHAT_NOT_OPEN: 'SOUL_MATCH_CHAT_NOT_OPEN',
  /** Hết cửa sổ rating (phase closed). */
  RATING_NOT_OPEN: 'SOUL_MATCH_RATING_NOT_OPEN',
  /** Đã rate verdict khác — rating immutable (docs/10 § Soul Match). */
  RATING_CONFLICT: 'SOUL_MATCH_RATING_CONFLICT',
  /** Cùng Idempotency-Key nhưng nội dung/session khác (docs/05 § 5.10). */
  MESSAGE_IDEMPOTENCY_CONFLICT: 'SOUL_MATCH_MESSAGE_IDEMPOTENCY_CONFLICT',
  /** Vượt SOUL_CHAT_MESSAGE_MAX_LENGTH (config) — DTO chỉ chặn sanity cap. */
  MESSAGE_TOO_LONG: 'SOUL_MATCH_MESSAGE_TOO_LONG',
  /** Chưa match (chưa có Friendship) — profile đối phương còn khoá (docs/01 #1). */
  PARTNER_LOCKED: 'SOUL_MATCH_PARTNER_LOCKED',
  CURSOR_INVALID: 'SOUL_MATCH_CURSOR_INVALID',
  /** Bị ban giữa chừng — re-check tại thời điểm gửi (docs/10 § 10.0.C). */
  USER_BANNED: 'SOUL_MATCH_USER_BANNED',
} as const;
