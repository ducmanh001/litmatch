/** Hằng số/key builder dùng bởi ≥2 file trong module (docs/05 § 5.1). */

/** Prefix phân luồng webhook LiveKit giữa calling (`call-*`) và party (`party-*`). */
export const PARTY_ROOM_NAME_PREFIX = 'party-';

/** Room name trên SFU đặt từ id server sinh — client không bao giờ tự chọn room. */
export function partyRoomName(roomId: string): string {
  return `${PARTY_ROOM_NAME_PREFIX}${roomId}`;
}

/** Tên partial unique index (migration 1752700000000) — phân biệt lỗi 23505 khi insert member. */
export const UQ_PARTY_MEMBERS_ACTIVE_ROOM_USER =
  'uq_party_members_active_room_user';
export const UQ_PARTY_MEMBERS_ACTIVE_USER = 'uq_party_members_active_user';

export const UQ_PARTY_ROOM_COMMENTS_IDEMPOTENCY =
  'uq_party_room_comments_idempotency_key';

/** Sanity cap ở DTO; giới hạn nghiệp vụ thật lấy từ PARTY_COMMENT_MAX_LENGTH trong service. */
export const PARTY_COMMENT_CONTENT_HARD_CAP = 1000;

export function partyCommentIdempotencyKey(
  userId: string,
  roomId: string,
  key: string,
): string {
  return `party:comment:${userId}:${roomId}:${key}`;
}
