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
  // `joinRoom.error` chỉ bắt lỗi REST join — kết nối LiveKit/publish mic chạy SAU khi mutation
  // đã resolve (trong onSuccess), nên lỗi ở đó (vd mic bị từ chối quyền) phải tự bắt và giữ ở
  // đây, không thì rơi ra ngoài React Query thành unhandled rejection và UI im lặng mãi mãi.
  const [mediaError, setMediaError] = useState<unknown>(null);
  const roomRef = useRef<Room | null>(null);

  const { mutate: joinRoomMutate } = joinRoom;
  const connect = useCallback(() => {
    setRoomDisconnected(false);
    setMediaError(null);
    joinRoomMutate(undefined, {
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
            connected.on(RoomEvent.Disconnected, () =>
              setRoomDisconnected(true),
            );
            roomRef.current = connected;
            setRoom(connected);
          } catch (err) {
            setMediaError(err);
          }
        })();
      },
    });
  }, [joinRoomMutate]);

  useEffect(() => {
    if (room === null) return;
    // Audience (canPublish=false) chỉ tắt mic — không cần quyền, không lỗi. Speaker/host bật
    // mic thật sự cần quyền trình duyệt, có thể bị từ chối bất cứ lúc nào (đổi role giữa
    // chừng) — phải bắt lỗi ở đây, room vẫn sống (chỉ mic câm), không rớt kết nối cả phòng.
    room.localParticipant
      .setMicrophoneEnabled(canPublish)
      .catch((err: unknown) => setMediaError(err));
  }, [room, canPublish]);

  useEffect(
    () => () => {
      if (roomRef.current !== null) void disconnectMediaRoom(roomRef.current);
    },
    [],
  );

  // Gọi tường minh khi phòng đóng (party.room.closed) — component không unmount, chỉ đổi
  // sang view đóng, nên cleanup-on-unmount ở trên không tự chạy trong trường hợp đó.
  const disconnect = useCallback(() => {
    if (roomRef.current !== null) void disconnectMediaRoom(roomRef.current);
    roomRef.current = null;
    setRoom(null);
  }, []);

  return {
    connect,
    disconnect,
    room,
    roomDisconnected,
    isConnecting: joinRoom.isPending,
    error: joinRoom.error ?? mediaError,
  };
}
