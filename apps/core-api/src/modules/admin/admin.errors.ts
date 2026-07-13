/** Mã lỗi của Admin module (docs/05 § 5.5) — format ADMIN_SUBJECT_REASON. */
export const AdminErrors = {
  /** Admin không được tự ban chính mình — tránh tự khoá mất quyền truy cập. */
  CANNOT_BAN_SELF: 'ADMIN_CANNOT_BAN_SELF',
} as const;

export type AdminErrorCode = (typeof AdminErrors)[keyof typeof AdminErrors];
