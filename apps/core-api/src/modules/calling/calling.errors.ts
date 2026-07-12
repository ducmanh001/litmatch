/** Mã lỗi của Calling module (docs/05 § 5.5) — format CALLING_SUBJECT_REASON. */
export const CallingErrors = {
  /** MatchSession/call không tồn tại HOẶC caller không phải thành viên — gộp, chống oracle (docs/10 § 10.1.D). */
  SESSION_NOT_FOUND: 'CALLING_SESSION_NOT_FOUND',
  CALL_NOT_FOUND: 'CALLING_CALL_NOT_FOUND',
  /** Session không phải voice đã confirmed — chưa có quyền mở phòng. */
  SESSION_NOT_CALLABLE: 'CALLING_SESSION_NOT_CALLABLE',
  /** Call đã kết thúc — không mint token/join lại được. */
  CALL_ENDED: 'CALLING_CALL_ENDED',
  /** Webhook LiveKit không verify được chữ ký. */
  WEBHOOK_INVALID: 'CALLING_WEBHOOK_INVALID',
} as const;
