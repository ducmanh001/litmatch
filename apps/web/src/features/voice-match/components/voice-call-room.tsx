'use client';

import { isApiError } from '@litmatch/api-client';
import { RealtimeEvents } from '@litmatch/common-dtos/pure';
import { useQueryClient } from '@tanstack/react-query';
import { RoomEvent, Track } from 'livekit-client';
import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';

import { MicIcon } from '../../../shared/ui/icons';
import { useRealtimeEvent } from '../../../shared/realtime/use-realtime-event';
import { useCall, useEndCall, voiceMatchKeys } from '../api';
import { useCallRoom } from '../hooks/use-call-room';

import type { CallEndedEventData } from '@litmatch/common-dtos/pure';
import type { RemoteTrack } from 'livekit-client';
import type { SVGProps } from 'react';

function MicOffIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg
      width={20}
      height={20}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      {...props}
    >
      <path d="M12 1a3 3 0 00-3 3v8a3 3 0 006 0V4a3 3 0 00-3-3z" />
      <path d="M19 10v2a7 7 0 01-14 0v-2M12 19v4M8 23h8" />
      <path d="M3 3l18 18" />
    </svg>
  );
}

function EndCallIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg
      width={22}
      height={22}
      viewBox="0 0 24 24"
      fill="currentColor"
      {...props}
    >
      <path d="M21 15.5c-1.2 0-2.4-.2-3.5-.6-.3-.1-.7 0-1 .2l-2.2 2.2c-2.8-1.4-5.2-3.8-6.6-6.6l2.2-2.2c.3-.3.4-.7.2-1-.3-1.1-.5-2.3-.5-3.5 0-.6-.4-1-1-1H4c-.6 0-1 .4-1 1 0 9.4 7.6 17 17 17 .6 0 1-.4 1-1v-3.5c0-.6-.4-1-1-1z" />
    </svg>
  );
}

const END_REASON_LABEL: Record<string, string> = {
  completed: 'Đã kết thúc',
  free_limit: 'Hết thời lượng miễn phí',
  insufficient_balance: 'Không đủ diamond',
  pending_timeout: 'Không ai vào phòng kịp',
};

/** `m:ss`, không giờ — free-call limit hiện đang tính bằng phút (docs/06), chưa cần giờ. */
function formatCallDuration(totalSeconds: number): string {
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${String(seconds).padStart(2, '0')}`;
}

export function VoiceCallRoom({ matchSessionId }: { matchSessionId: string }) {
  const queryClient = useQueryClient();
  const { connect, room, callId, roomDisconnected, isConnecting, error } =
    useCallRoom(matchSessionId);
  const call = useCall(callId);
  const endCall = useEndCall(callId ?? '');
  const [isMuted, setIsMuted] = useState(false);
  const audioContainerRef = useRef<HTMLDivElement>(null);
  const startedAt = call.data?.startedAt ?? null;
  const [now, setNow] = useState(() => Date.now());

  // Đồng hồ hiển thị thuần UX — chỉ server (billing tick) mới là nguồn sự thật cho thời lượng
  // tính phí (docs/10 § "Billing tick..."); client không tự trừ tiền theo đồng hồ này.
  useEffect(() => {
    if (startedAt === null) return;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [startedAt]);

  const elapsedSeconds =
    startedAt !== null
      ? Math.max(0, Math.floor((now - new Date(startedAt).getTime()) / 1000))
      : null;

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
      <div className="flex flex-col items-center px-8 pb-10 pt-6 text-center">
        <div className="relative mb-8 flex h-40 w-40 items-center justify-center">
          <span className="pulsering absolute inset-0 rounded-full border-2 border-irisl" />
          <span className="pulsering2 absolute inset-0 rounded-full border-2 border-irisl" />
          <div className="relative z-10 flex h-24 w-24 items-center justify-center rounded-full bg-gradient-to-br from-irisl to-irisl">
            <MicIcon width={32} height={32} className="text-white" />
          </div>
        </div>
        {message !== undefined && (
          <p role="alert" className="mb-4 text-sm text-destructive">
            {message}
          </p>
        )}
        <button
          type="button"
          className="w-full rounded-full bg-gradient-to-br from-irisl to-irisl py-3 font-bold text-white shadow-lg shadow-iris/30 disabled:opacity-50"
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
      <div className="flex flex-col items-center gap-2 px-8 py-16 text-center">
        <p className="text-sm text-slate-500 dark:text-slate-400">
          {c.endReason !== null
            ? (END_REASON_LABEL[c.endReason] ?? c.endReason)
            : 'Cuộc gọi đã kết thúc'}
          {c.durationSeconds !== null && ` — ${c.durationSeconds}s`}
        </p>
        <Link href="/home" className="text-sm font-bold text-irisl underline">
          Về trang chủ
        </Link>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center px-8 pb-10 pt-2 text-center">
      {/* Audio đối phương — không cần hiển thị, chỉ cần phát */}
      <div ref={audioContainerRef} className="hidden" />

      {elapsedSeconds !== null && (
        <p
          className="mb-4 rounded-full bg-iris/15 px-3 py-1.5 text-xs font-extrabold text-irisl"
          aria-live="off"
        >
          {formatCallDuration(elapsedSeconds)}
        </p>
      )}

      <div className="relative mb-6 flex h-36 w-36 items-center justify-center">
        <span className="speak-ring" />
        <span className="speak-ring speak-ring2" />
        <div className="relative z-10 flex h-28 w-28 items-center justify-center rounded-full border-4 border-white bg-surf2 dark:border-ink">
          <MicIcon
            width={28}
            height={28}
            className="text-slate-400 dark:text-slate-300"
          />
        </div>
      </div>
      <p className="mb-1 font-bold">Người lạ ẩn danh</p>
      <p className="mb-6 text-xs text-slate-500 dark:text-slate-400">
        Đang trò chuyện bằng giọng nói
      </p>

      <div className="mb-10 flex h-8 items-end gap-1.5">
        <span className="wave-bar" style={{ animationDelay: '0s' }} />
        <span className="wave-bar" style={{ animationDelay: '.15s' }} />
        <span className="wave-bar" style={{ animationDelay: '.3s' }} />
        <span className="wave-bar" style={{ animationDelay: '.45s' }} />
        <span className="wave-bar" style={{ animationDelay: '.6s' }} />
      </div>

      {roomDisconnected && (
        <div className="mb-8 w-full space-y-2">
          <p role="alert" className="text-sm text-destructive">
            Mất kết nối phòng thoại.
          </p>
          <button
            type="button"
            className="w-full rounded-full border border-black/10 py-3 font-bold hover:bg-black/5 dark:border-white/10 dark:hover:bg-white/5"
            onClick={connect}
          >
            Kết nối lại
          </button>
        </div>
      )}

      <div className="flex items-center gap-5">
        <button
          type="button"
          className="flex h-14 w-14 items-center justify-center rounded-full bg-slate-100 dark:bg-surf2"
          onClick={toggleMute}
        >
          {isMuted ? (
            <MicOffIcon width={20} height={20} />
          ) : (
            <MicIcon width={20} height={20} />
          )}
          <span className="sr-only">{isMuted ? 'Bật mic' : 'Tắt mic'}</span>
        </button>
        <button
          type="button"
          className="flex h-16 w-16 items-center justify-center rounded-full bg-rose-500 shadow-lg shadow-rose-500/30 disabled:opacity-50"
          disabled={endCall.isPending}
          onClick={() => endCall.mutate()}
        >
          <EndCallIcon width={22} height={22} className="text-white" />
          <span className="sr-only">
            {endCall.isPending ? 'Đang kết thúc…' : 'Kết thúc'}
          </span>
        </button>
      </div>
    </div>
  );
}
