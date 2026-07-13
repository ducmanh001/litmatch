import { Column, Entity, Index } from 'typeorm';

import { BaseAppEntity } from '../../../common/entities/base.entity';

export enum MatchType {
  Soul = 'soul',
  Voice = 'voice',
}

/**
 * Giới tính user muốn ghép (docs/01 #13). KHÔNG tái dùng enum `Gender` của user module:
 * preference có `any` và không cho chọn `unknown`/`other` — hai tập giá trị khác nhau về nghĩa.
 */
export enum GenderPreference {
  Any = 'any',
  Male = 'male',
  Female = 'female',
}

/**
 * Preference cụ thể chỉ pass khi gender đối phương bằng ĐÚNG giá trị đó — user gender
 * `unknown`/`other` chỉ ghép được với preference `any` (filter cơ bản, không đoán hộ).
 */
export function genderPreferenceAllows(
  pref: GenderPreference,
  partnerGender: string | undefined,
): boolean {
  return pref === GenderPreference.Any || (pref as string) === partnerGender;
}

export enum MatchTicketStatus {
  Queued = 'queued',
  Matched = 'matched',
  Confirmed = 'confirmed',
  Expired = 'expired',
  Cancelled = 'cancelled',
}

/**
 * Transition hợp lệ duy nhất của state machine ticket (docs/services/matching-service.md § 1).
 * Mọi chuyển trạng thái trong code PHẢI đi qua bảng này — không tin client gửi trạng thái đích.
 */
export const MATCH_TICKET_TRANSITIONS: Readonly<
  Record<MatchTicketStatus, readonly MatchTicketStatus[]>
> = {
  [MatchTicketStatus.Queued]: [
    MatchTicketStatus.Matched,
    MatchTicketStatus.Expired,
    MatchTicketStatus.Cancelled,
  ],
  [MatchTicketStatus.Matched]: [
    MatchTicketStatus.Confirmed,
    MatchTicketStatus.Expired,
  ],
  [MatchTicketStatus.Confirmed]: [],
  [MatchTicketStatus.Expired]: [],
  [MatchTicketStatus.Cancelled]: [],
};

/**
 * 1 yêu cầu ghép cặp (docs/services/matching-service.md § 5).
 * - Nguồn sự thật về trạng thái là Postgres — Redis sorted set chỉ là queue store dẫn xuất,
 *   matcher luôn verify lại DB trước khi ghép (docs/10 § 10.0.C).
 * - 1 user chỉ có 1 ticket `queued`/`matched` tại 1 thời điểm — chặn ở DB bằng partial unique
 *   index `uq_match_tickets_active_user` (xem migration 1752200000000), không chỉ ở code.
 * - `idempotencyKey` unique ở DB (docs/05 § 5.10): client retry POST /matching/tickets với
 *   cùng key nhận lại đúng ticket cũ, không tạo ticket thứ 2.
 */
@Entity({ name: 'match_tickets' })
@Index('idx_match_tickets_status_shard', [
  'status',
  'matchType',
  'region',
  'ageBand',
])
export class MatchTicket extends BaseAppEntity {
  @Index('idx_match_tickets_user')
  @Column({ type: 'uuid' })
  userId!: string;

  @Column({ type: 'varchar', length: 8 })
  matchType!: MatchType;

  /** Server tự lấy từ profile user (không tin client — docs/10 § 10.0.B); user chưa set region → 'GLOBAL'. */
  @Column({ type: 'varchar', length: 16 })
  region!: string;

  /** floor(tuổi / MATCHING_AGE_BAND_SIZE); user chưa khai sinh nhật → -1 (band "chưa rõ tuổi"). */
  @Column({ type: 'int' })
  ageBand!: number;

  /**
   * Snapshot lựa chọn giới tính cho LẦN vào queue này (đổi ý = cancel + join lại). Check khớp
   * 2 chiều tại matcher `tryPair` với gender đọc TƯƠI từ users (docs/10 § 10.0.C) — KHÔNG shard
   * theo gender: preference `any` phải quét được mọi ứng viên trong shard hiện có.
   */
  @Column({ type: 'varchar', length: 10, default: GenderPreference.Any })
  genderPreference!: GenderPreference;

  @Column({ type: 'varchar', length: 16, default: MatchTicketStatus.Queued })
  status!: MatchTicketStatus;

  /** Mốc vào hàng đợi — score Redis = enqueuedAtMs + trustPenaltyMs - priorityBoostMs. Requeue sau confirm-timeout tạo ticket MỚI với enqueuedAt mới. */
  @Column({ type: 'timestamptz' })
  enqueuedAt!: Date;

  /**
   * Tổng boost speed-up đã mua (ms), cộng dồn trong DB rồi set score Redis TUYỆT ĐỐI (ZADD XX)
   * thay vì ZINCRBY — nhờ đó retry/replay cùng idempotency key không double-boost (chỉ trả tiền 1 lần
   * thì chỉ được boost 1 lần — docs/10 § 10.0.D).
   */
  @Column({ type: 'int', default: 0 })
  priorityBoostMs!: number;

  /**
   * Snapshot 1 LẦN lúc enqueue từ trust score user (docs/services/safety-service.md § 3.2) —
   * KHÔNG cộng dồn/re-tính lại giữa lúc ticket chờ (khác priorityBoostMs — chỉ đổi qua API
   * speed-up tường minh). Chỉ làm chậm priority, không chặn hẳn matching.
   */
  @Column({ type: 'int', default: 0 })
  trustPenaltyMs!: number;

  @Column({ type: 'uuid', nullable: true })
  sessionId!: string | null;

  @Column({ length: 255, unique: true })
  idempotencyKey!: string;
}
