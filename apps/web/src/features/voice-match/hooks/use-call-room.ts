'use client';

import { RoomEvent } from 'livekit-client';
import { useCallback, useEffect, useRef, useState } from 'react';

import {
  connectMediaRoom,
  disconnectMediaRoom,
} from '../../../shared/media/livekit';
import { useJoinCall } from '../api';

import type { Room } from 'livekit-client';

/**
 * Sở hữu lifecycle LiveKit cho voice call (docs/12 § 12.5) — component chỉ consume
 * `room`, không tự connect/disconnect. `connect()` gọi lại được nhiều lần (trước khi call
 * `ended`) — server upsert idempotent theo matchSessionId nên re-join sau rớt mạng hợp lệ.
 */
export function useCallRoom(matchSessionId: string) {
  const joinCall = useJoinCall(matchSessionId);
  const [room, setRoom] = useState<Room | null>(null);
  const [callId, setCallId] = useState<string | null>(null);
  const [roomDisconnected, setRoomDisconnected] = useState(false);
  const roomRef = useRef<Room | null>(null);

  const { mutate: joinCallMutate } = joinCall;
  const connect = useCallback(() => {
    setRoomDisconnected(false);
    joinCallMutate(undefined, {
      onSuccess: async (joined) => {
        if (joined === undefined) return;
        if (roomRef.current !== null) {
          await disconnectMediaRoom(roomRef.current);
        }
        const connected = await connectMediaRoom(
          joined.token,
          joined.livekitUrl,
        );
        // connectMediaRoom chỉ join room — publish mic là bước riêng, thiếu thì call câm.
        await connected.localParticipant.setMicrophoneEnabled(true);
        connected.on(RoomEvent.Disconnected, () => setRoomDisconnected(true));
        roomRef.current = connected;
        setCallId(joined.call.id);
        setRoom(connected);
      },
    });
  }, [joinCallMutate]);

  useEffect(
    () => () => {
      if (roomRef.current !== null) void disconnectMediaRoom(roomRef.current);
    },
    [],
  );

  return {
    connect,
    room,
    callId,
    roomDisconnected,
    isConnecting: joinCall.isPending,
    error: joinCall.error,
  };
}
