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
  const roomRef = useRef<Room | null>(null);

  const { mutate: joinRoomMutate } = joinRoom;
  const connect = useCallback(() => {
    setRoomDisconnected(false);
    joinRoomMutate(undefined, {
      onSuccess: async (joined) => {
        if (joined === undefined) return;
        if (roomRef.current !== null) {
          await disconnectMediaRoom(roomRef.current);
        }
        const connected = await connectMediaRoom(
          joined.token,
          joined.livekitUrl,
        );
        connected.on(RoomEvent.Disconnected, () => setRoomDisconnected(true));
        roomRef.current = connected;
        setRoom(connected);
      },
    });
  }, [joinRoomMutate]);

  useEffect(() => {
    if (room === null) return;
    void room.localParticipant.setMicrophoneEnabled(canPublish);
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
    error: joinRoom.error,
  };
}
