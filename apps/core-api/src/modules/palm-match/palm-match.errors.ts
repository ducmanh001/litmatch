/** Mã lỗi của Palm Match module (docs/05 § 5.5). */
export const PalmMatchErrors = {
  /** Không có template active nào cho category — tránh 500/mảng rỗng khi chọn phần tử. */
  CATEGORY_EMPTY: 'PALM_MATCH_CATEGORY_EMPTY',
  /** `targetName` vượt quá `PALM_MATCH_TARGET_NAME_MAX_LENGTH`. */
  TARGET_NAME_TOO_LONG: 'PALM_MATCH_TARGET_NAME_TOO_LONG',
} as const;
