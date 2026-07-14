/** Hằng số/helper dùng bởi ≥2 file trong module (docs/05 § 5.1). */

/** Seed string đầu vào cho fnv1aHash — gói lại để không lệch định dạng giữa các chỗ gọi. */
export function palmMatchSeedInput(
  userId: string,
  category: string,
  forDate: string,
): string {
  return `${userId}:${category}:${forDate}`;
}
