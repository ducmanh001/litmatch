/** Mã lỗi của Friend module (docs/05 § 5.5) — format FRIEND_SUBJECT_REASON. */
export const FriendErrors = {
  /** friendUserId không phải bạn của caller (gộp not-found + not-friend, chống oracle). */
  NOT_FRIEND: 'FRIEND_NOT_FRIEND',
  /** Conversation không tồn tại HOẶC caller không phải thành viên — cùng 1 mã (docs/10 § 10.1.D). */
  CONVERSATION_NOT_FOUND: 'FRIEND_CONVERSATION_NOT_FOUND',
  /** Cùng Idempotency-Key nhưng nội dung/conversation khác (docs/05 § 5.10). */
  MESSAGE_IDEMPOTENCY_CONFLICT: 'FRIEND_MESSAGE_IDEMPOTENCY_CONFLICT',
  MESSAGE_TOO_LONG: 'FRIEND_MESSAGE_TOO_LONG',
  /** Message không có cả text lẫn ảnh — không có gì để gửi. */
  MESSAGE_EMPTY: 'FRIEND_MESSAGE_EMPTY',
  CURSOR_INVALID: 'FRIEND_CURSOR_INVALID',
} as const;
