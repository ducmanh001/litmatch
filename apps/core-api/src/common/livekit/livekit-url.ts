/**
 * Chọn LiveKit URL trả cho client theo region — Giai đoạn 7 multi-region (ADR 0005).
 *
 * Trung lập domain (nằm ở common/ — docs/03 § 3.2): chỉ nhận chuỗi config + region string,
 * không đụng entity/module nào. Region luôn là `User.region` do SERVER derive (cùng nguồn với
 * shard key của Matching — docs/10 § 10.0.B), không bao giờ nhận từ client.
 *
 * BẤT BIẾN (ADR 0005): mọi URL trong `LIVEKIT_REGION_URLS` phải trỏ về CÙNG MỘT cụm LiveKit
 * (chung Redis room state) — chọn URL chỉ là chọn edge endpoint gần client, không phải chọn
 * cụm khác. Nhờ đó fallback/lệch region chỉ kém tối ưu latency, không bao giờ tách 2 người
 * của cùng một room sang 2 cụm khác nhau.
 */

/**
 * Parse + validate `LIVEKIT_REGION_URLS` (JSON map region → ws/wss URL). Throw `Error` với
 * message rõ ràng khi sai — env.validation.ts gọi hàm này trong Joi `.custom()` để chết ngay
 * lúc boot thay vì vỡ lúc join call/room. Chuỗi rỗng = chưa bật multi-region (map rỗng).
 */
export function parseLivekitRegionUrls(raw: string): Record<string, string> {
  if (raw.trim() === '') return {};
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error(
      'LIVEKIT_REGION_URLS phải là JSON hợp lệ dạng {"REGION": "wss://..."}',
    );
  }
  if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error(
      'LIVEKIT_REGION_URLS phải là JSON object map region → URL, không phải mảng/scalar',
    );
  }
  const map: Record<string, string> = {};
  for (const [region, url] of Object.entries(parsed)) {
    if (region.trim() === '') {
      throw new Error('LIVEKIT_REGION_URLS có key region rỗng');
    }
    if (typeof url !== 'string' || !/^wss?:\/\/./.test(url)) {
      throw new Error(
        `LIVEKIT_REGION_URLS["${region}"] phải là URL ws:// hoặc wss://`,
      );
    }
    map[region] = url;
  }
  return map;
}

/**
 * Resolve URL LiveKit cho 1 region: có trong map → URL của region đó; region null/chưa map →
 * `defaultUrl` (`LIVEKIT_URL`). Deploy chỉ set `LIVEKIT_URL` (single-region hôm nay) đi qua
 * nhánh map-rỗng → hành vi y hệt trước khi có tính năng này.
 */
export function resolveLivekitUrl(
  regionUrlsRaw: string,
  defaultUrl: string,
  region: string | null | undefined,
): string {
  if (!region) return defaultUrl;
  return parseLivekitRegionUrls(regionUrlsRaw)[region] ?? defaultUrl;
}

/** Map có ít nhất 1 region? — cho phép caller short-circuit (khỏi query region) khi chưa bật multi-region. */
export function hasLivekitRegionUrls(regionUrlsRaw: string): boolean {
  return Object.keys(parseLivekitRegionUrls(regionUrlsRaw)).length > 0;
}
