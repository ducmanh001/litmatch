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
} as const;
