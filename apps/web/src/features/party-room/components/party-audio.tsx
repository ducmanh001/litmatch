'use client';

import { RoomEvent, Track } from 'livekit-client';
import { useEffect, useRef } from 'react';

import type { RemoteTrack, Room } from 'livekit-client';

/**
 * Attach/detach audio track của MỌI remote participant (cùng pattern với
 * features/voice-match/components/voice-call-room.tsx) — không cần biết danh tính
 * participant, roster/role đã có riêng từ REST (PartyRoomDetailDto.members).
 */
export function PartyAudio({ room }: { room: Room }) {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const container = containerRef.current;
    const attach = (track: RemoteTrack) => {
      if (track.kind !== Track.Kind.Audio) return;
      const el = track.attach();
      container?.appendChild(el);
    };
    const detach = (track: RemoteTrack) => {
      track.detach().forEach((el) => el.remove());
    };
    room.on(RoomEvent.TrackSubscribed, attach);
    room.on(RoomEvent.TrackUnsubscribed, detach);
    return () => {
      room.off(RoomEvent.TrackSubscribed, attach);
      room.off(RoomEvent.TrackUnsubscribed, detach);
    };
  }, [room]);

  return <div ref={containerRef} className="hidden" />;
}
