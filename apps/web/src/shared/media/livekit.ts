'use client';

import { Room } from 'livekit-client';

import { env } from '../env';

/**
 * Wrapper duy nhất sở hữu lifecycle LiveKit (docs/12 § 12.5) — component chỉ consume Room,
 * không tự new Room()/connect. Token mint từ core-api (endpoint party-room/calling) y như
 * mobile; FE không bao giờ thấy LIVEKIT_API_SECRET.
 *
 * `livekitUrl` nên lấy từ response join (region-aware — docs/07 Giai đoạn 7 multi-region);
 * chỉ fallback về env mặc định khi endpoint không trả (chưa có, tương thích ngược).
 */
export async function connectMediaRoom(
  accessToken: string,
  livekitUrl?: string,
): Promise<Room> {
  const room = new Room({
    // Tự điều chỉnh chất lượng publish theo subscriber — mặc định cho voice room nhiều người
    adaptiveStream: true,
    dynacast: true,
  });
  try {
    await room.connect(livekitUrl ?? env.NEXT_PUBLIC_LIVEKIT_URL, accessToken);
    return room;
  } catch (error) {
    // `Room` đã cấp socket/timer trước khi handshake hoàn tất; caller chưa nhận được reference
    // nên boundary tạo room phải tự dọn khi connect reject.
    await room.disconnect().catch(() => undefined);
    throw error;
  }
}

export async function disconnectMediaRoom(room: Room): Promise<void> {
  await room.disconnect();
}
