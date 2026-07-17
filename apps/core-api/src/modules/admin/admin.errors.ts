/** Mã lỗi của Admin module (docs/05 § 5.5) — format ADMIN_SUBJECT_REASON. */
export const AdminErrors = {
  /** Admin không được tự ban chính mình — tránh tự khoá mất quyền truy cập. */
  CANNOT_BAN_SELF: 'ADMIN_CANNOT_BAN_SELF',
  PERMISSION_FORBIDDEN: 'ADMIN_PERMISSION_FORBIDDEN',
  PERMISSION_UNKNOWN: 'ADMIN_PERMISSION_UNKNOWN',
  CANNOT_DISABLE_PERMISSION_CONTROL: 'ADMIN_CANNOT_DISABLE_PERMISSION_CONTROL',
  CANNOT_CHANGE_OWN_ROLE: 'ADMIN_CANNOT_CHANGE_OWN_ROLE',
  CANNOT_DEMOTE_LAST_ADMIN: 'ADMIN_CANNOT_DEMOTE_LAST_ADMIN',
} as const;

export type AdminErrorCode = (typeof AdminErrors)[keyof typeof AdminErrors];
