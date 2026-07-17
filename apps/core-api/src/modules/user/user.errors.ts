/** Mã lỗi của User module (docs/05 § 5.5). */
export const UserErrors = {
  PROFILE_NOT_FOUND: 'USER_PROFILE_NOT_FOUND',
  PROFILE_AGE_BELOW_MINIMUM: 'USER_PROFILE_AGE_BELOW_MINIMUM',
  PROFILE_BIRTH_DATE_INVALID: 'USER_PROFILE_BIRTH_DATE_INVALID',
  /** Khoảng tuổi "Đang tìm kiếm" min > max sau khi gộp giá trị mới với giá trị đã lưu. */
  SEEKING_AGE_RANGE_INVALID: 'USER_SEEKING_AGE_RANGE_INVALID',
} as const;
