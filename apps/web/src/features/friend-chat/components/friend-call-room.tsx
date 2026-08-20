'use client';

import { isApiError } from '@litmatch/api-client';
import { RealtimeEvents } from '@litmatch/common-dtos/pure';
import { useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';

import { confirmAction } from '../../../shared/lib/confirm-store';
import { showToast } from '../../../shared/lib/toast-store';
import { attachRemoteAudio } from '../../../shared/media/livekit';
import { MicIcon } from '../../../shared/ui/icons';
import { useRealtimeEvent } from '../../../shared/realtime/use-realtime-event';
import { usePartnerProfile } from '../api';
import { useCall, useEndCall, voiceMatchKeys } from '../../voice-match/api';
import { useCallRoom } from '../../voice-match/hooks/use-call-room';

import type { CallEndedEventData } from '@litmatch/common-dtos/pure';
import type { SVGProps } from 'react';

function EndCallIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg
      width={22}
      height={22}
      viewBox="0 0 24 24"
      fill="currentColor"
      aria-hidden
      {...props}
    >
      <path d="M21 15.5c-1.2 0-2.4-.2-3.5-.6-.3-.1-.7 0-1 .2l-2.2 2.2c-2.8-1.4-5.2-3.8-6.6-6.6l2.2-2.2c.3-.3.4-.7.2-1-.3-1.1-.5-2.3-.5-3.5 0-.6-.4-1-1-1H4c-.6 0-1 .4-1 1 0 9.4 7.6 17 17 17 .6 0 1-.4 1-1v-3.5c0-.6-.4-1-1-1z" />
    </svg>
  );
}

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
      aria-hidden
      {...props}
    >
      <path d="M12 1a3 3 0 00-3 3v8a3 3 0 006 0V4a3 3 0 00-3-3z" />
      <path d="M19 10v2a7 7 0 01-14 0v-2M12 19v4M8 23h8" />
      <path d="M3 3l18 18" />
    </svg>
  );
}

export function FriendCallRoom({ friendUserId }: { friendUserId: string }) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const partner = usePartnerProfile(friendUserId);
  const {
    connect,
    disconnect,
    room,
    callId,
    roomDisconnected,
    isConnecting,
    error,
    microphoneEnabled,
    setMicrophoneEnabled,
  } = useCallRoom({ friendUserId });
  const call = useCall(callId);
  const endCall = useEndCall(callId ?? '');
  const audioContainerRef = useRef<HTMLDivElement>(null);
  const attemptedRef = useRef(false);
  const [isMuted, setIsMuted] = useState(false);
  const [sessionEnded, setSessionEnded] = useState(false);
  const micIsMuted =
    microphoneEnabled === undefined ? isMuted : !microphoneEnabled;

  useEffect(() => {
    if (attemptedRef.current || room !== null || sessionEnded) return;
    attemptedRef.current = true;
    connect();
  }, [connect, room, sessionEnded]);

  useEffect(() => {
    if (room === null) return undefined;
    const container = audioContainerRef.current;
    if (container === null) return undefined;
    return attachRemoteAudio(room, container);
  }, [room]);

  useRealtimeEvent<CallEndedEventData>(RealtimeEvents.CallEnded, (data) => {
    if (callId !== null && data.callId === callId) {
      setSessionEnded(true);
      disconnect();
      void queryClient.invalidateQueries({
        queryKey: voiceMatchKeys.call(callId),
      });
    }
  });

  useEffect(() => {
    if (call.data?.status !== 'ended') return;
    setSessionEnded(true);
    disconnect();
  }, [call.data?.status, disconnect]);

  const retry = () => {
    attemptedRef.current = true;
    connect();
  };

  const toggleMute = () => {
    if (room === null) return;
    const nextMuted = !micIsMuted;
    const updateMic =
      setMicrophoneEnabled ??
      ((enabled: boolean) =>
        room.localParticipant.setMicrophoneEnabled(enabled));
    void updateMic(!nextMuted)
      .then(() => {
        setIsMuted(nextMuted);
        showToast(nextMuted ? 'Đã tắt mic' : 'Đã bật mic');
      })
      .catch(() => showToast('Không thể đổi trạng thái mic, thử lại.', 'warn'));
  };

  const handleEndCall = () => {
    void (async () => {
      const confirmed = await confirmAction({
        title: 'Kết thúc cuộc gọi?',
        message: 'Cuộc gọi sẽ kết thúc ngay.',
        actionLabel: 'Kết thúc cuộc gọi',
        tone: 'danger',
      });
      if (!confirmed) return;
      try {
        await endCall.mutateAsync();
        router.replace(`/chat/${friendUserId}`);
      } catch (endError) {
        showToast(
          isApiError(endError)
            ? endError.message
            : 'Không thể kết thúc cuộc gọi, thử lại.',
          'warn',
        );
      }
    })();
  };

  const nickname = partner.data?.nickname ?? 'đối phương';
  if (sessionEnded || call.data?.status === 'ended') {
    return (
      <div className="flex flex-1 flex-col items-center justify-center px-8 text-center">
        <div className="mb-5 flex h-20 w-20 items-center justify-center rounded-full bg-slate-100 dark:bg-surf2">
          <EndCallIcon className="text-slate-400" />
        </div>
        <h1 className="font-display mb-2 text-2xl font-semibold italic">
          Cuộc gọi đã kết thúc
        </h1>
        <p className="mb-8 text-sm text-slate-500">
          Bạn có thể tiếp tục nhắn tin với {nickname}.
        </p>
        <button
          type="button"
          className="w-full max-w-xs rounded-full bg-irisl py-3 font-bold text-white"
          onClick={() => router.replace(`/chat/${friendUserId}`)}
        >
          Quay lại tin nhắn
        </button>
      </div>
    );
  }

  if (room === null) {
    const message = isApiError(error)
      ? error.message
      : error !== null
        ? 'Có lỗi xảy ra, thử lại.'
        : undefined;
    return (
      <div className="flex flex-1 flex-col items-center justify-center px-8 text-center">
        <MicIcon width={32} height={32} className="mb-5 text-irisl" />
        <h1 className="font-display mb-2 text-2xl font-semibold italic">
          Gọi {nickname}
        </h1>
        {message !== undefined && (
          <p role="alert" className="mb-4 text-sm text-destructive">
            {message}
          </p>
        )}
        {isConnecting ? (
          <p className="text-sm font-semibold text-muted-foreground">
            Đang kết nối cuộc gọi…
          </p>
        ) : (
          <button
            type="button"
            className="w-full max-w-xs rounded-full bg-irisl py-3 font-bold text-white"
            onClick={retry}
          >
            Thử kết nối lại
          </button>
        )}
      </div>
    );
  }

  return (
    <div className="flex flex-1 flex-col items-center justify-center px-8 text-center">
      <div ref={audioContainerRef} className="sr-only" aria-hidden="true" />
      <div className="relative mb-7 flex h-36 w-36 items-center justify-center">
        <span className="speak-ring" />
        <span className="speak-ring speak-ring2" />
        <div className="relative z-10 flex h-28 w-28 items-center justify-center rounded-full border-4 border-white bg-surf2 dark:border-ink">
          <MicIcon width={28} height={28} className="text-slate-400" />
        </div>
      </div>
      <h1 className="font-display mb-1 text-2xl font-semibold italic">
        {nickname}
      </h1>
      <p className="mb-5 text-sm text-slate-500">
        {call.data?.status === 'pending'
          ? 'Đang chờ đối phương vào phòng…'
          : 'Đang trò chuyện bằng giọng nói'}
      </p>
      {roomDisconnected && (
        <div className="mb-6 space-y-2">
          <p role="alert" className="text-sm text-destructive">
            Mất kết nối phòng thoại.
          </p>
          <button
            type="button"
            className="rounded-full border border-black/10 px-5 py-2 font-bold dark:border-white/10"
            onClick={retry}
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
          aria-label={micIsMuted ? 'Bật mic' : 'Tắt mic'}
        >
          {micIsMuted ? <MicOffIcon /> : <MicIcon />}
        </button>
        <button
          type="button"
          className="flex h-14 w-14 items-center justify-center rounded-full bg-rose-500 shadow-lg shadow-rose-500/30 disabled:opacity-50"
          disabled={endCall.isPending}
          onClick={handleEndCall}
          aria-label="Kết thúc cuộc gọi"
        >
          <EndCallIcon className="text-white" />
        </button>
      </div>
    </div>
  );
}
