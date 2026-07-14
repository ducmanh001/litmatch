/**
 * Hằng số của module Matching (docs/05 § 5.1) — hằng có ngữ nghĩa vượt ra ngoài 1 file khai
 * ở đây ngay từ đầu, không đợi nơi dùng thứ 2.
 */

/** Unique partial index "1 user chỉ 1 ticket active" (migration matching-init) — chốt chặn race joinQueue. */
export const UQ_ACTIVE_USER = 'uq_match_tickets_active_user';

/** User chưa set region → shard chung (server derive, không nhận từ client — docs/10 § 10.0.B). */
export const DEFAULT_REGION = 'GLOBAL';

/** User chưa khai sinh nhật → band riêng "chưa rõ tuổi", chỉ ghép với nhau. */
export const UNKNOWN_AGE_BAND = -1;

/** Cửa sổ đếm rate-limit speed-up — gắn với ngữ nghĩa "per hour" của MATCHING_SPEEDUP_MAX_PER_HOUR. */
export const SPEEDUP_RATE_WINDOW_SECONDS = 3600;

/**
 * Idempotency key của Matching (lưu ở cột unique trong Postgres — docs/05 § 5.10, KHÔNG phải
 * Redis key; key Redis nằm ở `redis/matching-redis.provider.ts`). Tập trung 1 chỗ để thấy được
 * toàn bộ namespace `matching:*` — 2 loại key khác nhau mà trùng format là ghi đè lẫn nhau
 * âm thầm, rải literal ở từng service thì không ai nhìn ra (docs/05 § 5.1).
 */

/** Vào queue — theo (user, Idempotency-Key client gửi). */
export function joinIdempotencyKey(
  userId: string,
  idempotencyKey: string,
): string {
  return `matching:join:${userId}:${idempotencyKey}`;
}

/** Speed-up trả diamond — theo (user, Idempotency-Key client gửi); economy dùng nguyên chuỗi này làm key giao dịch. */
export function speedupIdempotencyKey(
  userId: string,
  idempotencyKey: string,
): string {
  return `matching:speedup:${userId}:${idempotencyKey}`;
}

/** Sweeper requeue bên đã confirm — tất định theo (session, ticket cũ), sweeper chạy lại không tạo ticket đôi. */
export function requeueIdempotencyKey(
  sessionId: string,
  expiredTicketId: string,
): string {
  return `matching:requeue:${sessionId}:${expiredTicketId}`;
}

/**
 * Ticket tạo trực tiếp từ invite accept (bỏ qua hàng đợi shard) — tất định theo (invite, vai
 * trò), accept lặp lại (retry) không tạo ticket đôi qua unique constraint idempotency_key
 * (docs/05 § 5.10), tương tự `joinIdempotencyKey` nhưng nguồn là invite thay vì client key.
 */
export function inviteAcceptIdempotencyKey(
  inviteId: string,
  role: 'inviter' | 'invitee',
): string {
  return `matching:invite-accept:${inviteId}:${role}`;
}

/**
 * Derive ageBand từ birthDate — pure function (tách khỏi `MatchingService` để `InviteService`
 * dùng chung khi tạo ticket trực tiếp từ invite accept, docs/11 § DRY có chọn lọc: cùng phép
 * tính, 2 chỗ gọi trong CÙNG module thì tách hàm chung, không cần đẩy ra `common/`).
 */
export function ageBandOf(birthDate: string | null, bandSize: number): number {
  if (!birthDate) return UNKNOWN_AGE_BAND;
  const birth = new Date(birthDate);
  if (Number.isNaN(birth.getTime())) return UNKNOWN_AGE_BAND;
  const now = new Date();
  let age = now.getFullYear() - birth.getFullYear();
  const beforeBirthday =
    now.getMonth() < birth.getMonth() ||
    (now.getMonth() === birth.getMonth() && now.getDate() < birth.getDate());
  if (beforeBirthday) age -= 1;
  if (age < 0) return UNKNOWN_AGE_BAND;
  return Math.floor(age / bandSize);
}

/**
 * Snapshot 1 lần lúc enqueue (docs/services/safety-service.md § 3.2) — trust score < 100 cộng
 * thêm ms vào score, làm chậm priority chứ không chặn hẳn matching. Pure function — lý do tách
 * giống `ageBandOf`.
 */
export function trustPenaltyMsOf(
  trustScore: number,
  perPoint: number,
  maxMs: number,
): number {
  return Math.min(maxMs, Math.max(0, 100 - trustScore) * perPoint);
}
