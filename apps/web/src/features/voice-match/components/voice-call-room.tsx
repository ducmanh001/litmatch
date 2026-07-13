'use client';

import { isApiError } from '@litmatch/api-client';
import { RealtimeEvents } from '@litmatch/common-dtos/pure';
import { useQueryClient } from '@tanstack/react-query';
import { RoomEvent, Track } from 'livekit-client';
import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';

import { useRealtimeEvent } from '../../../shared/realtime/use-realtime-event';
import { useCall, useEndCall, voiceMatchKeys } from '../api';
import { useCallRoom } from '../hooks/use-call-room';

import type { CallEndedEventData } from '@litmatch/common-dtos/pure';
import type { RemoteTrack } from 'livekit-client';

const primaryButtonClass =
  'h-10 w-full rounded-md bg-primary font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50';
const secondaryButtonClass =
  'h-10 rounded-md border border-border px-4 text-sm font-medium hover:bg-card disabled:opacity-50';

const END_REASON_LABEL: Record<string, string> = {
  completed: 'Đã kết thúc',
  free_limit: 'Hết thời lượng miễn phí',
  insufficient_balance: 'Không đủ diamond',
  pending_timeout: 'Không ai vào phòng kịp',
};

export function VoiceCallRoom({ matchSessionId }: { matchSessionId: string }) {
  const queryClient = useQueryClient();
  const { connect, room, callId, roomDisconnected, isConnecting, error } =
    useCallRoom(matchSessionId);
  const call = useCall(callId);
  const endCall = useEndCall(callId ?? '');
  const [isMuted, setIsMuted] = useState(false);
  const audioContainerRef = useRef<HTMLDivElement>(null);

  useRealtimeEvent<CallEndedEventData>(RealtimeEvents.CallEnded, (data) => {
    if (callId !== null && data.callId === callId) {
      void queryClient.invalidateQueries({
        queryKey: voiceMatchKeys.call(callId),
      });
    }
  });

  // Room chỉ join + publish mic (useCallRoom) — attach audio đối phương là việc UI, làm ở đây.
  useEffect(() => {
    if (room === null) return;
    const container = audioContainerRef.current;
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

  const toggleMute = (): void => {
    if (room === null) return;
    const next = !isMuted;
    void room.localParticipant.setMicrophoneEnabled(!next);
    setIsMuted(next);
  };

  if (room === null) {
    const message = isApiError(error)
      ? error.message
      : error !== null
        ? 'Có lỗi xảy ra, thử lại.'
        : undefined;
    return (
      <div className="space-y-3">
        {message !== undefined && (
          <p role="alert" className="text-sm text-destructive">
            {message}
          </p>
        )}
        <button
          type="button"
          className={primaryButtonClass}
          disabled={isConnecting}
          onClick={connect}
        >
          {isConnecting ? 'Đang kết nối…' : 'Bắt đầu cuộc gọi'}
        </button>
      </div>
    );
  }

  if (call.data?.status === 'ended') {
    const c = call.data;
    return (
      <div className="space-y-2">
        <p className="text-sm">
          {c.endReason !== null
            ? (END_REASON_LABEL[c.endReason] ?? c.endReason)
            : 'Cuộc gọi đã kết thúc'}
          {c.durationSeconds !== null && ` — ${c.durationSeconds}s`}
        </p>
        <Link href="/home" className="text-sm text-primary underline">
          Về trang chủ
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {/* Audio đối phương — không cần hiển thị, chỉ cần phát */}
      <div ref={audioContainerRef} className="hidden" />
      {roomDisconnected && (
        <div className="space-y-2">
          <p role="alert" className="text-sm text-destructive">
            Mất kết nối phòng thoại.
          </p>
          <button
            type="button"
            className={secondaryButtonClass}
            onClick={connect}
          >
            Kết nối lại
          </button>
        </div>
      )}
      <div className="flex gap-2">
        <button
          type="button"
          className={secondaryButtonClass}
          onClick={toggleMute}
        >
          {isMuted ? 'Bật mic' : 'Tắt mic'}
        </button>
        <button
          type="button"
          className={secondaryButtonClass}
          disabled={endCall.isPending}
          onClick={() => endCall.mutate()}
        >
          {endCall.isPending ? 'Đang kết thúc…' : 'Kết thúc'}
        </button>
      </div>
    </div>
  );
}
