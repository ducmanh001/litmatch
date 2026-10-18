/**
 * Mặt phẳng realtime (pub/sub `realtime:user:*` + presence/quota socket) chia shard theo userId.
 *
 * Một Redis đơn lẻ có trần cứng: mỗi socket sống refresh lease định kỳ và mỗi event publish phải
 * tới đúng pod giữ user. Ở hàng triệu socket, trần đó là CPU của một Redis (đo bằng
 * `loadtest/realtime-plane-bench.mjs`), không phải số pod gateway. Chia theo userId giữ mọi
 * thao tác của một user (publish, subscribe, lease, presence) trên cùng một shard — không có
 * lệnh nào đi xuyên shard — nên thêm shard là tăng trần tuyến tính.
 *
 * Hợp đồng dùng chung cho producer (core-api), consumer (signaling-gateway) và reader presence:
 * cả ba PHẢI nhận cùng danh sách URL theo cùng thứ tự, nếu không event sẽ publish vào shard mà
 * không pod nào subscribe (best-effort, client còn REST polling nên không mất dữ liệu bền).
 * Đổi số shard là đổi chỗ của user — state ở đây ephemeral nên chỉ cần rolling restart cả ba.
 */

const FNV_OFFSET_BASIS = 0x811c9dc5;
const FNV_PRIME = 0x01000193;

/**
 * FNV-1a 32-bit trên từng code unit của userId (UUID — ASCII). Tự cài đặt thay vì dùng hash của
 * thư viện để kết quả bất biến giữa phiên bản Node và giữa các app; đổi hàm này là đổi chỗ của
 * toàn bộ user (xem test known-vectors).
 */
export function realtimeShardIndex(userId: string, shardCount: number): number {
  if (!Number.isInteger(shardCount) || shardCount <= 1) return 0;
  let hash = FNV_OFFSET_BASIS;
  for (let index = 0; index < userId.length; index += 1) {
    hash ^= userId.charCodeAt(index);
    hash = Math.imul(hash, FNV_PRIME);
  }
  return (hash >>> 0) % shardCount;
}

/**
 * `REALTIME_REDIS_URLS` (danh sách ngăn cách bằng dấu phẩy) → URL từng shard theo thứ tự.
 * Rỗng/không đặt → đúng một shard là Redis mặc định (`REDIS_URL`), hành vi như trước khi có shard.
 */
export function parseRealtimeRedisUrls(
  raw: string | undefined,
  fallbackUrl: string,
): string[] {
  const urls = (raw ?? '')
    .split(',')
    .map((url) => url.trim())
    .filter((url) => url.length > 0);
  return urls.length > 0 ? urls : [fallbackUrl];
}
