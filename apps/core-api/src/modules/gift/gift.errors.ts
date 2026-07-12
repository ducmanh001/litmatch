/** Mã lỗi của Gift module (docs/05 § 5.5) — format GIFT_SUBJECT_REASON. */
export const GiftErrors = {
  /** Quà không tồn tại hoặc đã tắt khỏi catalog. */
  GIFT_NOT_FOUND: 'GIFT_GIFT_NOT_FOUND',
  /** Không tự tặng quà cho chính mình (không có ý nghĩa kinh tế, chỉ để farm điểm). */
  SELF_GIFT_FORBIDDEN: 'GIFT_SELF_GIFT_FORBIDDEN',
  /** Người tặng không phải member active của phòng. */
  SENDER_NOT_IN_ROOM: 'GIFT_SENDER_NOT_IN_ROOM',
  /** Người nhận không phải member active của phòng. */
  RECEIVER_NOT_IN_ROOM: 'GIFT_RECEIVER_NOT_IN_ROOM',
} as const;
