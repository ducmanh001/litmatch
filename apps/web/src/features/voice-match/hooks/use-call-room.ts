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
  // Mỗi lần connect/unmount tăng generation. REST join không thể bị hủy đáng tin cậy ở mọi
  // browser; guard này bảo đảm một response đến muộn không thể nối lại room sau khi user đã
  // rời màn hoặc sau khi họ bấm kết nối lại lần nữa.
  const generationRef = useRef(0);
  const disposedRef = useRef(false);

  const { mutate: joinCallMutate } = joinCall;
  const connect = useCallback(() => {
    disposedRef.current = false;
    const generation = ++generationRef.current;
    setRoomDisconnected(false);
    setMediaError(null);
    joinCallMutate(undefined, {
      onSuccess: (joined) => {
        if (joined === undefined) return;
        void (async () => {
          let connected: Room | null = null;
          try {
            if (disposedRef.current || generation !== generationRef.current) {
              return;
            }
            if (roomRef.current !== null) {
              await disconnectMediaRoom(roomRef.current);
              roomRef.current = null;
            }
            if (disposedRef.current || generation !== generationRef.current) {
              return;
            }
            connected = await connectMediaRoom(joined.token, joined.livekitUrl);
            // connectMediaRoom chỉ join room — publish mic là bước riêng, thiếu thì call câm.
            await connected.localParticipant.setMicrophoneEnabled(true);
            if (disposedRef.current || generation !== generationRef.current) {
              await disconnectMediaRoom(connected);
              return;
            }
            connected.on(RoomEvent.Disconnected, () =>
              setRoomDisconnected(true),
            );
            roomRef.current = connected;
            setCallId(joined.call.id);
            setRoom(connected);
          } catch (err) {
            // Nếu microphone bị từ chối thì `connected` đã vào LiveKit nhưng chưa được đưa vào
            // roomRef. Phải đóng CHÍNH room này, nếu không server vẫn thấy participant và phiên
            // pending bị treo tới khi timeout.
            if (connected !== null) {
              await disconnectMediaRoom(connected).catch(() => undefined);
            } else if (roomRef.current !== null) {
              await disconnectMediaRoom(roomRef.current).catch(() => undefined);
              roomRef.current = null;
            }
            if (!disposedRef.current && generation === generationRef.current) {
              setMediaError(err);
            }
          }
        })();
      },
    });
  }, [joinCallMutate]);

  useEffect(
    () => () => {
      disposedRef.current = true;
      generationRef.current += 1;
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
