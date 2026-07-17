export enum AdminPermission {
  ViewUsers = 'view_users',
  BanUsers = 'ban_users',
  ResolveReports = 'resolve_reports',
  RefundTransaction = 'refund_transaction',
  ManageGifts = 'manage_gifts',
  ManageConfig = 'manage_config',
  ManageRooms = 'manage_rooms',
  ManagePermissions = 'manage_permissions',
  ManageSupport = 'manage_support',
}

/** Metadata key riêng admin; guard deny route mới nếu thiếu permission tường minh. */
export const ADMIN_PERMISSION_KEY = 'admin_permission';

export const ADMIN_PERMISSION_LABELS: Readonly<
  Record<AdminPermission, string>
> = {
  [AdminPermission.ViewUsers]: 'Xem danh sách người dùng',
  [AdminPermission.BanUsers]: 'Khoá / Mở khoá tài khoản',
  [AdminPermission.ResolveReports]: 'Duyệt báo cáo & video ngắn',
  [AdminPermission.RefundTransaction]: 'Hoàn tiền giao dịch',
  [AdminPermission.ManageGifts]: 'Quản lý Gift catalog',
  [AdminPermission.ManageConfig]: 'Cấu hình gói Diamond / Thông báo',
  [AdminPermission.ManageRooms]: 'Quản lý Party Room',
  [AdminPermission.ManagePermissions]: 'Phân quyền admin',
  [AdminPermission.ManageSupport]: 'Xử lý yêu cầu hỗ trợ',
};
