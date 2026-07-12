/** Mã lỗi của Party Room module (docs/05 § 5.5) — format PARTY_SUBJECT_REASON. */
export const PartyRoomErrors = {
  /** Phòng không tồn tại HOẶC đã đóng với người ngoài — gộp, chống oracle (docs/10 § 10.1.D). */
  ROOM_NOT_FOUND: 'PARTY_ROOM_NOT_FOUND',
  /** Phòng đã đóng — không join/đổi role/tặng quà được nữa. */
  ROOM_CLOSED: 'PARTY_ROOM_CLOSED',
  /** Phòng đã đủ PARTY_MAX_MEMBERS. */
  ROOM_FULL: 'PARTY_ROOM_FULL',
  /** User đang ở 1 phòng active khác — 1 user 1 phòng (party-room-service.md § 3). */
  ALREADY_IN_ANOTHER_ROOM: 'PARTY_MEMBER_ALREADY_IN_ANOTHER_ROOM',
  /** Caller không phải member active của phòng. */
  NOT_A_MEMBER: 'PARTY_MEMBER_NOT_A_MEMBER',
  /** Target không phải member active của phòng. */
  TARGET_NOT_A_MEMBER: 'PARTY_TARGET_NOT_A_MEMBER',
  /** Chỉ host mới được cấp/thu quyền speaker (docs/06). */
  NOT_HOST: 'PARTY_MEMBER_NOT_HOST',
  /** Không đổi role của chính host. */
  CANNOT_CHANGE_HOST_ROLE: 'PARTY_MEMBER_CANNOT_CHANGE_HOST_ROLE',
  /** Đã chạm speaker_limit của phòng (giới hạn cứng — docs/03 § 3.8.A). */
  SPEAKER_LIMIT_REACHED: 'PARTY_SPEAKER_LIMIT_REACHED',
  /** Title vượt PARTY_TITLE_MAX_LENGTH. */
  TITLE_TOO_LONG: 'PARTY_ROOM_TITLE_TOO_LONG',
  /** Webhook LiveKit không verify được chữ ký. */
  WEBHOOK_INVALID: 'PARTY_WEBHOOK_INVALID',
  /** Tạo room trên SFU thất bại — thử lại sau. */
  MEDIA_ROOM_CREATE_FAILED: 'PARTY_MEDIA_ROOM_CREATE_FAILED',
  CURSOR_INVALID: 'PARTY_ROOM_CURSOR_INVALID',
} as const;
