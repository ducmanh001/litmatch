import { fnv1aHash } from '../../common/hash/fnv1a';
import { canonicalPair } from '../../common/entities/canonical-pair';

/** Quantize 1 toạ độ về lưới `step` độ — làm tròn, không cắt (docs/services/discovery-service.md § Nearby). */
export function quantizeCoordinate(value: number, step: number): number {
  return Math.round(value / step) * step;
}

/** Khoảng cách haversine giữa 2 toạ độ (km) — đủ chính xác cho MVP, không cần PostGIS. */
export function haversineDistanceKm(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number,
): number {
  const earthRadiusKm = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) ** 2;
  return earthRadiusKm * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

/**
 * Jitter tất định theo cặp-theo-ngày (pattern FNV-1a của palm-match) — lớp bảo vệ thứ 2 chống
 * trilateration: cùng 1 cặp user, cùng 1 ngày UTC, luôn cộng thêm đúng 1 lượng jitter cố định
 * (tránh lộ thông tin qua nhiều lần truy vấn trong ngày); qua ngày khác jitter đổi (chống cộng
 * dồn nhiều ngày để suy ra vị trí thật). KHÔNG dùng cho mục đích crypto/bảo mật tuyệt đối — xem
 * cảnh báo gốc ở `common/hash/fnv1a.ts`, đây là defense-in-depth, không chống được adversary có
 * nguồn lực lớn (đã ghi nhận ở review-module plan W4).
 */
export function nearbyJitterKm(
  userIdA: string,
  userIdB: string,
  forDate: string,
  maxJitterKm: number,
): number {
  const [low, high] = canonicalPair(userIdA, userIdB);
  const seed = fnv1aHash(`${low}:${high}:${forDate}`);
  // seed % 1000 → [0, 999] → scale về [-maxJitterKm/2, +maxJitterKm/2]
  return (seed % 1000) * (maxJitterKm / 1000) - maxJitterKm / 2;
}

/**
 * Bucket khoảng cách rộng từ `DISCOVERY_DISTANCE_BUCKETS_KM` — CSV mốc tăng dần (vd 1,3,5,10,20
 * → "<1km", "1-3km", "3-5km", "5-10km", "10-20km", "20km+"). Không bao giờ trả số km chính xác.
 */
export function computeDistanceBucket(
  distanceKm: number,
  boundariesCsv: string,
): string {
  const boundaries = boundariesCsv
    .split(',')
    .map((s) => Number(s.trim()))
    .filter((n) => Number.isFinite(n))
    .sort((a, b) => a - b);

  if (boundaries.length === 0 || distanceKm < boundaries[0]) {
    return `<${boundaries[0] ?? 0}km`;
  }
  for (let i = boundaries.length - 1; i >= 0; i--) {
    if (distanceKm >= boundaries[i]) {
      const upper = i + 1 < boundaries.length ? boundaries[i + 1] : null;
      return upper !== null
        ? `${boundaries[i]}-${upper}km`
        : `${boundaries[i]}km+`;
    }
  }
  return `<${boundaries[0]}km`;
}
