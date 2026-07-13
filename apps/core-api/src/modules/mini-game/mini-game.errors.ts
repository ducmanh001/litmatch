/** Mã lỗi của Mini Game module (docs/05 § 5.5) — format MINI_GAME_REASON. */
export const MiniGameErrors = {
  /**
   * `friendUserId` không phải bạn của caller HOẶC caller tự nhắm chính mình — gộp 1 mã, cùng
   * 404 (chống oracle dò userId, cùng pattern `MovieMatchErrors.NOT_FRIEND`).
   */
  NOT_FRIEND: 'MINI_GAME_NOT_FRIEND',
  /** Caller đang chờ move ở 1 CẶP KHÁC — không tự ý huỷ ván cũ thay user. */
  ALREADY_WAITING: 'MINI_GAME_ALREADY_WAITING',
  /** Session không tồn tại HOẶC caller không phải participant — cùng 1 mã (docs/10 § 10.1.D). */
  NOT_FOUND: 'MINI_GAME_SESSION_NOT_FOUND',
  /**
   * Nộp move lần 2 (đã nộp trước đó) HOẶC session không còn `waiting_moves`
   * (đã `resolved`/`cancelled`) — update có điều kiện thấy 0 row ảnh hưởng (docs/10 § 10.1.C).
   */
  MOVE_ALREADY_SUBMITTED: 'MINI_GAME_MOVE_ALREADY_SUBMITTED',
  /** Huỷ ván đã `resolved`/`cancelled` — chỉ huỷ được ván đang `waiting_moves`. */
  NOT_CANCELLABLE: 'MINI_GAME_NOT_CANCELLABLE',
} as const;
