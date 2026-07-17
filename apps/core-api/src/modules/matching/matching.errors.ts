/** Mã lỗi của Matching module (docs/05 § 5.5) — format MATCHING_SUBJECT_REASON. */
export const MatchingErrors = {
  TICKET_NOT_FOUND: 'MATCHING_TICKET_NOT_FOUND',
  TICKET_ALREADY_QUEUED: 'MATCHING_TICKET_ALREADY_QUEUED',
  TICKET_INVALID_TRANSITION: 'MATCHING_TICKET_INVALID_TRANSITION',
  /** Ticket không thuộc user đang gọi — chống IDOR (docs/10 § 10.1.D). */
  TICKET_FORBIDDEN: 'MATCHING_TICKET_FORBIDDEN',
  /** Cùng Idempotency-Key nhưng nội dung request khác (docs/05 § 5.10). */
  TICKET_IDEMPOTENCY_CONFLICT: 'MATCHING_TICKET_IDEMPOTENCY_CONFLICT',
  SESSION_NOT_PENDING: 'MATCHING_SESSION_NOT_PENDING',
  SPEEDUP_RATE_LIMITED: 'MATCHING_SPEEDUP_RATE_LIMITED',
  /** User bị ban không được vào hàng đợi (re-verify lại lần nữa tại thời điểm ghép). */
  USER_BANNED: 'MATCHING_USER_BANNED',
  /** Không mời được người đang nằm trong hidden-set (banned/guest/block/report) — oracle-safe, cùng mã bất kể lý do. */
  INVITE_TARGET_UNAVAILABLE: 'MATCHING_INVITE_TARGET_UNAVAILABLE',
  INVITE_NOT_FOUND: 'MATCHING_INVITE_NOT_FOUND',
  /** Invite không thuộc user đang gọi (không phải inviter/invitee tương ứng hành động). */
  INVITE_FORBIDDEN: 'MATCHING_INVITE_FORBIDDEN',
  INVITE_INVALID_TRANSITION: 'MATCHING_INVITE_INVALID_TRANSITION',
  /** Đã có 1 invite PENDING khác tới đúng người này (unique DB, không phải rate-limit chính). */
  INVITE_ALREADY_PENDING: 'MATCHING_INVITE_ALREADY_PENDING',
  INVITE_RATE_LIMITED: 'MATCHING_INVITE_RATE_LIMITED',
  /** 1 trong 2 bên (inviter/invitee) đang có ticket active khác tại thời điểm accept (docs/06). */
  INVITE_ACCEPT_USER_BUSY: 'MATCHING_INVITE_ACCEPT_USER_BUSY',
  INVITE_CURSOR_INVALID: 'MATCHING_INVITE_CURSOR_INVALID',
} as const;
