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
