/** Hằng số/helper dùng bởi ≥2 file trong module (docs/05 § 5.1). */

/**
 * Ngày hiện tại theo giờ SERVER, UTC, format `YYYY-MM-DD` — dùng làm 1 phần seed (docs/services/
 * palm-match-service.md § 1). PHẢI gọi `new Date()` tại thời điểm request tới (không cache), và
 * seed hoàn toàn tính ở server — client không gửi/chọn được ngày này.
 */
export function todayUtcDateString(now: Date): string {
  const year = now.getUTCFullYear();
  const month = String(now.getUTCMonth() + 1).padStart(2, '0');
  const day = String(now.getUTCDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/** Seed string đầu vào cho fnv1aHash — gói lại để không lệch định dạng giữa các chỗ gọi. */
export function palmMatchSeedInput(
  userId: string,
  category: string,
  forDate: string,
): string {
  return `${userId}:${category}:${forDate}`;
}
