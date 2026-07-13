import { Column, Entity, PrimaryColumn } from 'typeorm';

/**
 * Bảng phụ trợ THUẦN để enforce bất biến "1 user chỉ có 1 MovieSession active tại 1 thời
 * điểm" — PK trên `userId` chặn 1 user xuất hiện ở > 1 session active BẤT KỂ họ là
 * `userLowId` hay `userHighId` của session đó.
 *
 * Lý do cần bảng riêng thay vì 2 partial unique index trên `movie_sessions(user_low_id)`/
 * `(user_high_id)`: 2 index đơn cột đó KHÔNG đủ — 1 user có thể là `userLowId` ở session A
 * (với bạn X) và `userHighId` ở session B (với bạn Y) CÙNG LÚC; mỗi index chỉ soi 1 cột nên
 * không phát hiện xung đột CHÉO cột (phát hiện qua integration test race, xem
 * `movie-match.integration.spec.ts`). PK trên `userId` ở ĐÚNG 1 cột gộp cả 2 vai trò thì
 * chặn được toàn bộ trường hợp.
 *
 * Ghi/xoá LUÔN cùng transaction với thay đổi `MovieSession.status`
 * (`MovieMatchService.createSession`/`endSession`) — không có API đọc/ghi bảng này ngoài đó.
 */
@Entity({ name: 'movie_session_active_participants' })
export class MovieSessionActiveParticipant {
  @PrimaryColumn({ type: 'uuid' })
  userId!: string;

  @Column({ type: 'uuid' })
  sessionId!: string;
}
