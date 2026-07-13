/**
 * Chuẩn hoá cặp 2 chiều (a, b) về (low, high) theo so sánh chuỗi uuid — dùng chung cho mọi
 * entity "1 dòng/cặp user" (Friendship/Conversation — docs/services/friend-service.md § 1,
 * Movie Match/Mini Game — Giai đoạn 5). Hạ tầng trung lập thuần function, không mang nghiệp vụ
 * của module nào (docs/16 § 16.3 common/).
 */
export function canonicalPair(a: string, b: string): [string, string] {
  return a < b ? [a, b] : [b, a];
}
