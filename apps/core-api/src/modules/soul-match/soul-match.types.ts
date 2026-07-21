import type { MatchSession } from '../matching';

/** Phase phòng chat, được dẫn xuất từ timestamp DB và giờ server. */
export enum SoulRoomPhase {
  Chatting = 'chatting',
  Rating = 'rating',
  Closed = 'closed',
}

/**
 * View nội bộ của phòng chat ẩn danh. Đây là contract thuần giữa service và mapper DTO;
 * không đặt trong service để tránh DTO phụ thuộc ngược vào implementation.
 */
export interface SoulRoomView {
  session: MatchSession;
  chatEndsAt: Date;
  ratingEndsAt: Date;
  phase: SoulRoomPhase;
}
