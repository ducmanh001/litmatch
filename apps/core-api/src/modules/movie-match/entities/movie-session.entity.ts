import { Column, Entity } from 'typeorm';

import { BaseAppEntity } from '../../../common/entities/base.entity';

/** Trạng thái phiên xem chung (docs/services/movie-match-service.md § 3). */
export enum MovieSessionStatus {
  Active = 'active',
  Ended = 'ended',
}

/**
 * Lý do kết thúc. `Left`: 1 trong 2 bên chủ động kết thúc qua
 * `POST /movie-match/sessions/:id/end` — nhánh DUY NHẤT được trigger ở bản này.
 * `Replaced` được giữ trong taxonomy theo đúng spec § 3/§ 5 nhưng KHÔNG có nhánh code nào
 * set giá trị này hiện tại: tạo session mới cho CÙNG cặp trả lại session cũ (idempotent, không
 * kết thúc); tạo với CẶP KHÁC trong khi đang active bị chặn 409 (không tự ý kết thúc thay user) —
 * không có luồng "tự động thay session" ở slice này. Giữ lại để không phải migration thêm giá trị
 * enum khi 1 luồng "chuyển bạn xem cùng" thật sự được thêm sau.
 */
export enum MovieSessionEndReason {
  Left = 'left',
  Replaced = 'replaced',
}

/**
 * Phiên xem chung 2 người ĐÃ LÀ BẠN (docs/services/movie-match-service.md). Cặp canonical
 * `userLowId < userHighId` — cùng kỹ thuật `Friendship`/`Conversation`. KHÔNG có bảng message
 * riêng: chat trong lúc xem đi thẳng qua `Conversation`/`FriendService` đã có (spec § 2).
 * Bất biến DB (migration 1753200000000): 1 user chỉ có 1 MovieSession `active` tại 1 thời điểm,
 * enforce qua bảng phụ trợ `MovieSessionActiveParticipant` (PK `userId`) — xem comment ở đó
 * để biết vì sao KHÔNG dùng 2 partial unique index đơn cột trên `userLowId`/`userHighId`.
 */
@Entity({ name: 'movie_sessions' })
export class MovieSession extends BaseAppEntity {
  @Column({ type: 'uuid' })
  userLowId!: string;

  @Column({ type: 'uuid' })
  userHighId!: string;

  /** Whitelist domain validate ở service (`MOVIE_MATCH_ALLOWED_VIDEO_HOSTS`) — không proxy/transcode. */
  @Column({ type: 'text' })
  videoUrl!: string;

  /** Nguồn sự thật vị trí phát — client nội suy giữa 2 lần cập nhật, không tin đồng hồ client. */
  @Column({ type: 'double precision', default: 0 })
  positionSeconds!: number;

  @Column({ type: 'boolean', default: false })
  isPlaying!: boolean;

  /** Server timestamp của lần ghi `positionSeconds`/`isPlaying` gần nhất. */
  @Column({ type: 'timestamptz' })
  positionUpdatedAt!: Date;

  @Column({ type: 'varchar', length: 16, default: MovieSessionStatus.Active })
  status!: MovieSessionStatus;

  @Column({ type: 'timestamptz', nullable: true })
  endedAt!: Date | null;

  @Column({ type: 'varchar', length: 16, nullable: true })
  endReason!: MovieSessionEndReason | null;
}
