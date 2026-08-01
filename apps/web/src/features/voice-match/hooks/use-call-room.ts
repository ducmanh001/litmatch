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
  const [microphoneEnabled, setMicrophoneEnabledState] = useState(false);
  // `joinCall.error` chỉ bắt lỗi REST join — kết nối LiveKit/publish mic chạy SAU khi mutation
  // đã resolve (trong onSuccess), nên lỗi ở đó (vd mic bị từ chối quyền) phải tự bắt và giữ ở
  // đây, không thì rơi ra ngoài React Query thành unhandled rejection. Remote audio vẫn cần
  // hoạt động khi chỉ publish mic thất bại, đồng thời UI phải cho phép retry bằng nút mic.
  const [mediaError, setMediaError] = useState<unknown>(null);
  const roomRef = useRef<Room | null>(null);
  // Mỗi lần connect/unmount tăng generation. REST join không thể bị hủy đáng tin cậy ở mọi
  // browser; guard này bảo đảm một response đến muộn không thể nối lại room sau khi user đã
  // rời màn hoặc sau khi họ bấm kết nối lại lần nữa.
  const generationRef = useRef(0);
  const disposedRef = useRef(false);
  const microphoneRequestRef = useRef(0);

  const { mutate: joinCallMutate } = joinCall;
  const setMicrophoneEnabled = useCallback(async (enabled: boolean) => {
    const current = roomRef.current;
    if (current === null) return;
    const request = ++microphoneRequestRef.current;
    try {
      await current.localParticipant.setMicrophoneEnabled(enabled);
      if (
        current !== roomRef.current ||
        request !== microphoneRequestRef.current
      ) {
        return;
      }
      setMicrophoneEnabledState(enabled);
      setMediaError(null);
    } catch (err) {
      if (
        current === roomRef.current &&
        request === microphoneRequestRef.current
      ) {
        setMicrophoneEnabledState(false);
        setMediaError(err);
      }
      throw err;
    }
  }, []);
  const connect = useCallback(() => {
    disposedRef.current = false;
    const generation = ++generationRef.current;
    setRoomDisconnected(false);
    setMediaError(null);
    setMicrophoneEnabledState(false);
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
              const previous = roomRef.current;
              roomRef.current = null;
              setRoom(null);
              setCallId(null);
              await disconnectMediaRoom(previous);
            }
            if (disposedRef.current || generation !== generationRef.current) {
              return;
            }
            connected = await connectMediaRoom(joined.token, joined.livekitUrl);
            if (disposedRef.current || generation !== generationRef.current) {
              await disconnectMediaRoom(connected);
              return;
            }
            // Nhận ownership ngay khi socket đã join. Prompt xin quyền microphone có thể treo
            // vô hạn; nếu unmount/reconnect trong lúc đó thì cleanup phải nhìn thấy room này.
            roomRef.current = connected;
            if (disposedRef.current || generation !== generationRef.current) {
              if (roomRef.current === connected) roomRef.current = null;
              await disconnectMediaRoom(connected);
              return;
            }
            connected.on(RoomEvent.Disconnected, () => {
              if (
                !disposedRef.current &&
                generation === generationRef.current &&
                roomRef.current === connected
              ) {
                setRoomDisconnected(true);
              }
            });
            roomRef.current = connected;
            setCallId(joined.call.id);
            setRoom(connected);
            void setMicrophoneEnabled(true).catch(() => undefined);
          } catch (err) {
            // Chỉ lỗi connect/network mới đóng room. Lỗi microphone được xử lý ở promise riêng
            // phía trên để remote audio vẫn hoạt động.
            if (connected !== null) {
              if (roomRef.current === connected) roomRef.current = null;
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
  }, [joinCallMutate, setMicrophoneEnabled]);

  useEffect(
    () => () => {
      disposedRef.current = true;
      generationRef.current += 1;
      microphoneRequestRef.current += 1;
      setMicrophoneEnabledState(false);
      const current = roomRef.current;
      roomRef.current = null;
      if (current !== null) void disconnectMediaRoom(current);
    },
    [],
  );

  return {
    connect,
    room,
    callId,
    roomDisconnected,
    microphoneEnabled,
    setMicrophoneEnabled,
    isConnecting: joinCall.isPending,
    error: joinCall.error ?? mediaError,
  };
}
