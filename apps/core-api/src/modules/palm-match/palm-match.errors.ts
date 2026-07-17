/** Mã lỗi của Palm Match module (docs/05 § 5.5). */
export const PalmMatchErrors = {
  /** Không có template active nào cho category — tránh 500/mảng rỗng khi chọn phần tử. */
  CATEGORY_EMPTY: 'PALM_MATCH_CATEGORY_EMPTY',
  /** `targetName` vượt quá `PALM_MATCH_TARGET_NAME_MAX_LENGTH`. */
  TARGET_NAME_TOO_LONG: 'PALM_MATCH_TARGET_NAME_TOO_LONG',
  /** Session không tồn tại, caller không còn active trong session hoặc không phải participant. */
  SESSION_NOT_FOUND: 'PALM_MATCH_SESSION_NOT_FOUND',
  /** Session đã terminal nên không nhận thêm flip/rating. */
  SESSION_FINISHED: 'PALM_MATCH_SESSION_FINISHED',
  /** Rating chỉ mở sau khi cả hai participant tự lật lá của mình. */
  RATING_NOT_OPEN: 'PALM_MATCH_RATING_NOT_OPEN',
  /** Một rating đã chốt không được đổi verdict khi retry. */
  RATING_CONFLICT: 'PALM_MATCH_RATING_CONFLICT',
} as const;
