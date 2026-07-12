/**
 * Hợp đồng realtime giữa core-api (producer — publish Redis pub/sub) và signaling-gateway
 * (consumer — fanout xuống Socket.IO). Docs/services/realtime-gateway.md.
 *
 * Nguyên tắc (docs/03 § 3.3 — gateway KHÔNG business logic):
 * - Channel theo NGƯỜI NHẬN: `realtime:user:{userId}` — authz/membership/ẩn danh đã được
 *   core-api quyết xong TẠI THỜI ĐIỂM PUBLISH (payload tính sẵn per-recipient, vd senderRole).
 *   Gateway chỉ verify JWT lúc handshake rồi relay nguyên văn, không đọc/sửa payload.
 * - Best-effort: publish fail không phá nghiệp vụ — client luôn còn REST polling làm fallback,
 *   vì vậy KHÔNG dùng outbox cho các event ephemeral này.
 */

export const REALTIME_USER_CHANNEL_PREFIX = 'realtime:user:';
/** Pattern cho PSUBSCRIBE phía gateway. */
export const REALTIME_USER_CHANNEL_PATTERN = `${REALTIME_USER_CHANNEL_PREFIX}*`;

export function realtimeUserChannel(userId: string): string {
  return `${REALTIME_USER_CHANNEL_PREFIX}${userId}`;
}

/** userId từ tên channel — null nếu không đúng format (gateway bỏ qua channel lạ). */
export function parseRealtimeUserChannel(channel: string): string | null {
  if (!channel.startsWith(REALTIME_USER_CHANNEL_PREFIX)) return null;
  const userId = channel.slice(REALTIME_USER_CHANNEL_PREFIX.length);
  return userId.length > 0 ? userId : null;
}

/** Tên event Socket.IO — thêm event mới thì thêm vào đây, 2 app cùng thấy. */
export const RealtimeEvents = {
  /** Message chat ẩn danh mới trong phòng Soul Match. */
  SoulMessage: 'soul.message',
  /** Cả 2 cùng "Thích" — đã match, profile unlock. */
  SoulMatched: 'soul.matched',
  /** Ticket được ghép cặp — chờ 2 bên confirm. */
  MatchMatched: 'match.matched',
  /** Cả 2 đã confirm — session bắt đầu. */
  MatchConfirmed: 'match.confirmed',
  /** Voice call kết thúc (mọi lý do — kể cả server tự end hết free window). */
  CallEnded: 'call.ended',
  /** Message mới trong chat 1-1 lâu dài giữa 2 bạn (khác chat ẩn danh Soul Match). */
  FriendMessage: 'friend.message',
  /** Member vào/ra Party Room (fanout cho member active còn lại trong phòng). */
  PartyMemberJoined: 'party.member.joined',
  PartyMemberLeft: 'party.member.left',
  /** Host cấp/thu quyền speaker — grant SFU đã đổi xong ở server trước khi publish. */
  PartyRoleChanged: 'party.role.changed',
  /** Phòng đóng (host rời, hết member, sweeper) — client phải rời UI phòng. */
  PartyRoomClosed: 'party.room.closed',
  /** Quà tặng trong Party Room — publish SAU khi transaction tiền commit (docs/10 § Gift). */
  GiftSent: 'gift.sent',
} as const;
export type RealtimeEventName =
  (typeof RealtimeEvents)[keyof typeof RealtimeEvents];

/** Phong bì publish lên Redis — gateway relay `emit(event, data)` nguyên văn. */
export interface RealtimeEnvelope<T = unknown> {
  event: RealtimeEventName;
  data: T;
}

export interface SoulMessageEventData {
  sessionId: string;
  messageId: string;
  /** Đã tính per-recipient ở core-api — KHÔNG bao giờ chứa userId đối phương (ẩn danh). */
  senderRole: 'me' | 'partner';
  content: string;
  sentAt: string;
}

export interface SoulMatchedEventData {
  sessionId: string;
}

export interface MatchMatchedEventData {
  ticketId: string;
  sessionId: string;
}

export interface MatchConfirmedEventData {
  ticketId: string;
  sessionId: string;
}

export interface CallEndedEventData {
  callId: string;
  matchSessionId: string;
  /** completed | free_limit | insufficient_balance | pending_timeout (calling-service.md § 1). */
  reason: string;
  durationSeconds: number;
}

export interface FriendMessageEventData {
  conversationId: string;
  messageId: string;
  /** KHÔNG ẩn danh (2 bên đã unlock profile khi thành bạn) — khác SoulMessageEventData. */
  senderUserId: string;
  content: string;
  sentAt: string;
}

export interface PartyMemberJoinedEventData {
  roomId: string;
  userId: string;
  /** host | speaker | audience (party-room-service.md § 2). */
  role: string;
}

export interface PartyMemberLeftEventData {
  roomId: string;
  userId: string;
}

export interface PartyRoleChangedEventData {
  roomId: string;
  userId: string;
  role: string;
}

export interface PartyRoomClosedEventData {
  roomId: string;
  /** host_left | empty | swept (party-room-service.md § 4). */
  reason: string;
}

export interface GiftSentEventData {
  roomId: string;
  giftEventId: string;
  giftCode: string;
  senderUserId: string;
  receiverUserId: string;
  priceDiamond: number;
  /** PTS người nhận thực nhận (0 nếu receiver là guest — docs/06 § Gift). */
  pointsAwarded: number;
  sentAt: string;
}
