'use client';

import { useEffect, useRef } from 'react';

import { attachRemoteAudio } from '../../../shared/media/livekit';

import type { Room } from 'livekit-client';

/**
 * Attach/detach audio track của MỌI remote participant (cùng pattern với
 * features/voice-match/components/voice-call-room.tsx) — không cần biết danh tính
 * participant, roster/role đã có riêng từ REST (PartyRoomDetailDto.members).
 */
export function PartyAudio({ room }: { room: Room }) {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const container = containerRef.current;
    if (container === null) return undefined;
    return attachRemoteAudio(room, container);
  }, [room]);

  return <div ref={containerRef} className="sr-only" aria-hidden="true" />;
}
