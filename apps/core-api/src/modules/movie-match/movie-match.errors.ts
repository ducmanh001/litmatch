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
} as const;
