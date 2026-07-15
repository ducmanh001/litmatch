/**
 * `PublicProfileDto`/`FriendDto`/... chỉ có `avatarId` (id hệ layer/equip), không có URL ảnh
 * thật — thay vì icon trung lập, dùng Dicebear (host cố định, seed = userId nên deterministic
 * per user) đúng kỹ thuật layouts/web/*.html đã dùng cho mọi avatar demo. Không phải dữ liệu
 * nghiệp vụ thật (không ảnh hưởng ledger/ownership) nên hardcode ở tầng hiển thị là an toàn.
 */
export function placeholderAvatarUrl(seed: string): string {
  return `https://api.dicebear.com/7.x/adventurer/svg?seed=${encodeURIComponent(seed)}`;
}
