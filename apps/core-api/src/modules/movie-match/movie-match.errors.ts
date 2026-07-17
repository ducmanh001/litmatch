/** Mã lỗi của Movie Match module (docs/05 § 5.5) — format MOVIE_SESSION_REASON. */
export const MovieMatchErrors = {
  /**
   * `friendUserId` không phải bạn của caller HOẶC caller tự nhắm chính mình — gộp 1 mã, cùng
   * 404 (chống oracle dò userId, cùng pattern `FriendErrors.NOT_FRIEND`).
   */
  NOT_FRIEND: 'MOVIE_SESSION_NOT_FRIEND',
  /** Caller đang active với 1 cặp KHÁC — không tự ý kết thúc session cũ thay user (spec § 3). */
  ALREADY_ACTIVE: 'MOVIE_SESSION_ALREADY_ACTIVE',
  /** Session không tồn tại HOẶC caller không phải participant — cùng 1 mã (docs/10 § 10.1.D). */
  NOT_FOUND: 'MOVIE_SESSION_NOT_FOUND',
  /** Session đã `ended` mà vẫn thao tác state. */
  ENDED: 'MOVIE_SESSION_ENDED',
  /** `videoUrl` sai format, quá dài, hoặc domain không nằm trong whitelist. */
  INVALID_VIDEO_URL: 'MOVIE_SESSION_INVALID_VIDEO_URL',
  /** Rating gọi trước khi phase xem kết thúc (chưa "Kết thúc"/chưa hết giờ). */
  RATING_NOT_OPEN: 'MOVIE_SESSION_RATING_NOT_OPEN',
  /** Đổi rating đã chốt — mỗi bên chỉ đánh giá một lần. */
  RATING_CONFLICT: 'MOVIE_SESSION_RATING_CONFLICT',
  /** Chat quá MOVIE_MATCH_MESSAGE_MAX_LENGTH. */
  MESSAGE_TOO_LONG: 'MOVIE_SESSION_MESSAGE_TOO_LONG',
  /** Cùng Idempotency-Key nhưng nội dung/session khác (docs/05 § 5.10). */
  MESSAGE_IDEMPOTENCY_CONFLICT: 'MOVIE_SESSION_MESSAGE_IDEMPOTENCY_CONFLICT',
  /** Reaction emoji ngoài whitelist. */
  REACTION_INVALID: 'MOVIE_SESSION_REACTION_INVALID',
  /** Không có video nào trong MOVIE_MATCH_ANON_VIDEO_URLS — lỗi cấu hình vận hành. */
  ANON_VIDEO_POOL_EMPTY: 'MOVIE_SESSION_ANON_VIDEO_POOL_EMPTY',
} as const;
