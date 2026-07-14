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
  // `joinCall.error` chỉ bắt lỗi REST join — kết nối LiveKit/publish mic chạy SAU khi mutation
  // đã resolve (trong onSuccess), nên lỗi ở đó (vd mic bị từ chối quyền) phải tự bắt và giữ ở
  // đây, không thì rơi ra ngoài React Query thành unhandled rejection: `room` không bao giờ
  // được set (đúng ý — call thiếu mic thì vô dụng) nhưng UI cũng không biết vì sao mà báo.
  const [mediaError, setMediaError] = useState<unknown>(null);
  const roomRef = useRef<Room | null>(null);

  const { mutate: joinCallMutate } = joinCall;
  const connect = useCallback(() => {
    setRoomDisconnected(false);
    setMediaError(null);
    joinCallMutate(undefined, {
      onSuccess: (joined) => {
        if (joined === undefined) return;
        void (async () => {
          try {
            if (roomRef.current !== null) {
              await disconnectMediaRoom(roomRef.current);
            }
            const connected = await connectMediaRoom(
              joined.token,
              joined.livekitUrl,
            );
            // connectMediaRoom chỉ join room — publish mic là bước riêng, thiếu thì call câm.
            await connected.localParticipant.setMicrophoneEnabled(true);
            connected.on(RoomEvent.Disconnected, () =>
              setRoomDisconnected(true),
            );
            roomRef.current = connected;
            setCallId(joined.call.id);
            setRoom(connected);
          } catch (err) {
            setMediaError(err);
          }
        })();
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
    error: joinCall.error ?? mediaError,
  };
}
