'use client';

import { RoomEvent } from 'livekit-client';
import { useCallback, useEffect, useRef, useState } from 'react';

import {
  connectMediaRoom,
  disconnectMediaRoom,
} from '../../../shared/media/livekit';
import { useJoinRoom } from '../api';

import type { Room } from 'livekit-client';

/**
 * Sở hữu lifecycle LiveKit cho Party Room (docs/12 § 12.5) — cùng hình dạng với
 * features/voice-match/hooks/use-call-room.ts. Khác 1 điểm: mic publish PHẢN ỨNG theo
 * `canPublish` hiện tại (không chỉ set 1 lần lúc connect) — host promote/demote giữa
 * chừng phải bật/tắt mic theo, không đợi user tự connect lại.
 */
export function usePartyRoomMedia(roomId: string, canPublish: boolean) {
  const joinRoom = useJoinRoom(roomId);
  const [room, setRoom] = useState<Room | null>(null);
  const [roomDisconnected, setRoomDisconnected] = useState(false);
  const [microphoneEnabled, setMicrophoneEnabledState] = useState(false);
  // `joinRoom.error` chỉ bắt lỗi REST join — kết nối LiveKit/publish mic chạy SAU khi mutation
  // đã resolve (trong onSuccess), nên lỗi ở đó (vd mic bị từ chối quyền) phải tự bắt và giữ ở
  // đây, không thì rơi ra ngoài React Query thành unhandled rejection và UI im lặng mãi mãi.
  const [mediaError, setMediaError] = useState<unknown>(null);
  const roomRef = useRef<Room | null>(null);
  // Mỗi connect/disconnect/unmount đổi generation để response REST/LiveKit đến muộn không thể
  // dựng lại room sau khi owner đã rời hoặc ghi đè một lần reconnect mới hơn.
  const generationRef = useRef(0);
  const disposedRef = useRef(false);
  const microphoneRequestRef = useRef(0);

  const { mutate: joinRoomMutate } = joinRoom;

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
    joinRoomMutate(undefined, {
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
            setMicrophoneEnabledState(false);
            setRoom(connected);
          } catch (err) {
            if (connected !== null) {
              await disconnectMediaRoom(connected).catch(() => undefined);
            }
            if (!disposedRef.current && generation === generationRef.current) {
              setMediaError(err);
            }
          }
        })();
      },
    });
  }, [joinRoomMutate]);

  useEffect(() => {
    if (room === null) return;
    const generation = generationRef.current;
    let cancelled = false;
    // Audience (canPublish=false) chỉ tắt mic — không cần quyền, không lỗi. Speaker/host bật
    // mic thật sự cần quyền trình duyệt, có thể bị từ chối bất cứ lúc nào (đổi role giữa
    // chừng) — phải bắt lỗi ở đây, room vẫn sống (chỉ mic câm), không rớt kết nối cả phòng.
    void setMicrophoneEnabled(canPublish).catch((err: unknown) => {
      if (
        !cancelled &&
        !disposedRef.current &&
        generation === generationRef.current &&
        roomRef.current === room
      ) {
        setMediaError(err);
      }
    });

    return () => {
      cancelled = true;
    };
  }, [room, canPublish, setMicrophoneEnabled]);

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

  // Gọi tường minh khi phòng đóng (party.room.closed) — component không unmount, chỉ đổi
  // sang view đóng, nên cleanup-on-unmount ở trên không tự chạy trong trường hợp đó.
  const disconnect = useCallback(() => {
    generationRef.current += 1;
    microphoneRequestRef.current += 1;
    const current = roomRef.current;
    roomRef.current = null;
    if (current !== null) void disconnectMediaRoom(current);
    setMicrophoneEnabledState(false);
    setRoom(null);
  }, []);

  return {
    connect,
    disconnect,
    room,
    roomDisconnected,
    microphoneEnabled,
    setMicrophoneEnabled,
    isConnecting: joinRoom.isPending,
    error: joinRoom.error ?? mediaError,
  };
}
