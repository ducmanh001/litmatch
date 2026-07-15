/** Số "đang nghe" quyết định (hash theo id phòng) — `PartyRoomDto` không có field số người
 * nghe/audience-count thật, hiển thị demo cho đủ layout như mockup, không phải dữ liệu thật. */
export function decorativeListenerCount(roomId: string): number {
  let hash = 0;
  for (let i = 0; i < roomId.length; i += 1)
    hash = (hash * 31 + roomId.charCodeAt(i)) | 0;
  return 15 + (Math.abs(hash) % 40);
}
