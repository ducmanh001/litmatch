import { Column, Entity, Index } from 'typeorm';

import { BaseAppEntity } from '../../../common/entities/base.entity';

export enum CallSessionStatus {
  /** Đã tạo (join lần đầu) — chờ đủ 2 bên vào phòng LiveKit. */
  Pending = 'pending',
  /** Cả 2 đã join — startedAt là mốc tính free window + billing. */
  Active = 'active',
  /** Terminal — mọi transition sau đó là no-op idempotent. */
  Ended = 'ended',
}

export enum CallEndReason {
  /** Kết thúc bình thường: member gọi end / rời phòng / room_finished. */
  Completed = 'completed',
  /** Hết free window khi billing tắt — server tự end (docs/10 § Calling). */
  FreeLimit = 'free_limit',
  /** 1 trong 2 bên không đủ diamond cho phút tiếp theo. */
  InsufficientBalance = 'insufficient_balance',
  /** Không đủ 2 bên join trong CALLING_PENDING_TIMEOUT_SECONDS. */
  PendingTimeout = 'pending_timeout',
}

/**
 * Phiên voice call 2 người trên LiveKit (docs/services/calling-service.md § 1).
 * 1 voice MatchSession = tối đa 1 call — unique DB trên matchSessionId.
 * durationSeconds tính bằng giờ server core-api (nguồn sự thật), không tin client/SFU.
 */
@Entity({ name: 'call_sessions' })
@Index('uq_call_sessions_match_session', ['matchSessionId'], { unique: true })
@Index('idx_call_sessions_status_created', ['status', 'createdAt'])
export class CallSession extends BaseAppEntity {
  @Column({ type: 'uuid' })
  matchSessionId!: string;

  /** Room LiveKit = `call-{id}` — lưu để webhook lookup ngược; client không tự chọn room. */
  @Column({ type: 'varchar', length: 64 })
  roomName!: string;

  @Column({ type: 'uuid' })
  userAId!: string;

  @Column({ type: 'uuid' })
  userBId!: string;

  @Column({ type: 'varchar', length: 16, default: CallSessionStatus.Pending })
  status!: CallSessionStatus;

  @Column({ type: 'timestamptz', nullable: true })
  joinedAAt!: Date | null;

  @Column({ type: 'timestamptz', nullable: true })
  joinedBAt!: Date | null;

  @Column({ type: 'timestamptz', nullable: true })
  startedAt!: Date | null;

  @Column({ type: 'timestamptz', nullable: true })
  endedAt!: Date | null;

  @Column({ type: 'varchar', length: 24, nullable: true })
  endReason!: CallEndReason | null;

  @Column({ type: 'int', nullable: true })
  durationSeconds!: number | null;

  /** Số phút ĐÃ trừ diamond xong (đối xứng 2 bên — spec § 4); 0 khi billing tắt. */
  @Column({ type: 'int', default: 0 })
  billedMinutes!: number;
}

/** Room LiveKit của calling — prefix cố định để webhook lọc room không thuộc mình. */
export function callRoomName(callId: string): string {
  return `call-${callId}`;
}
