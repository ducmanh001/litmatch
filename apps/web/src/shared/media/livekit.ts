'use client';

import { Room, RoomEvent, Track } from 'livekit-client';

import { env } from '../env';

import type { RemoteTrack } from 'livekit-client';

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

/**
 * Gắn audio remote cho cả event mới lẫn publication đã subscribe trước khi React effect chạy.
 * LiveKit có thể subscribe track ngay trong `room.connect()`, vì vậy chỉ nghe TrackSubscribed
 * sẽ làm bên vào sau không nghe được người đã nói trước đó (đặc biệt dễ thấy PC ↔ mobile).
 */
export function attachRemoteAudio(
  room: Room,
  container: HTMLElement,
): () => void {
  const attached = new Set<RemoteTrack>();

  const attach = (track: RemoteTrack): void => {
    if (track.kind !== Track.Kind.Audio || attached.has(track)) return;
    const element = track.attach();
    element.autoplay = true;
    element.setAttribute('playsinline', 'true');
    container.appendChild(element);
    // A user gesture may already have happened, but Safari can still delay a newly
    // attached element. Failure is harmless; the browser will retry after interaction.
    void element.play().catch(() => undefined);
    attached.add(track);
  };

  const detach = (track: RemoteTrack): void => {
    track.detach().forEach((element) => element.remove());
    attached.delete(track);
  };

  room.on(RoomEvent.TrackSubscribed, attach);
  room.on(RoomEvent.TrackUnsubscribed, detach);

  const participants = room.remoteParticipants?.values?.() ?? [];
  for (const participant of participants) {
    for (const publication of participant.trackPublications.values()) {
      if (publication.isSubscribed && publication.track !== undefined) {
        attach(publication.track);
      }
    }
  }

  return () => {
    room.off(RoomEvent.TrackSubscribed, attach);
    room.off(RoomEvent.TrackUnsubscribed, detach);
    for (const track of attached.keys()) detach(track);
  };
}
