import { Column, Entity, PrimaryColumn } from 'typeorm';

/**
 * Bảng phụ trợ THUẦN để enforce bất biến "1 user chỉ có 1 MiniGameSession `waiting_moves`
 * tại 1 thời điểm" — PK trên `userId` chặn 1 user xuất hiện ở > 1 session đang chờ move BẤT KỂ
 * họ là `userLowId` hay `userHighId` của session đó.
 *
 * COPY kỹ thuật `MovieSessionActiveParticipant` (đã chứng minh đúng bằng integration test race ở
 * `movie-match.integration.spec.ts`): lý do cần bảng riêng thay vì 2 partial unique index trên
 * `mini_game_sessions(user_low_id)`/`(user_high_id)` — 2 index đơn cột đó KHÔNG đủ, vì 1 user có
 * thể là `userLowId` ở session A (với bạn X) và `userHighId` ở session B (với bạn Y) CÙNG LÚC;
 * mỗi index chỉ soi 1 cột nên không phát hiện xung đột CHÉO cột. PK trên `userId` ở ĐÚNG 1 cột
 * gộp cả 2 vai trò thì chặn được toàn bộ trường hợp.
 *
 * Ghi/xoá LUÔN cùng transaction với thay đổi `MiniGameSession.status`
 * (`MiniGameService.createSession`/`submitMove` khi resolve/`cancelSession`) — không có API
 * đọc/ghi bảng này ngoài đó.
 */
@Entity({ name: 'mini_game_active_participants' })
export class MiniGameActiveParticipant {
  @PrimaryColumn({ type: 'uuid' })
  userId!: string;

  @Column({ type: 'uuid' })
  sessionId!: string;
}
