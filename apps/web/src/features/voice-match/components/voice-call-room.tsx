'use client';

import { isApiError } from '@litmatch/api-client';
import { RealtimeEvents } from '@litmatch/common-dtos/pure';
import { useQueryClient } from '@tanstack/react-query';
import { RoomEvent, Track } from 'livekit-client';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';

import { confirmAction } from '../../../shared/lib/confirm-store';
import { formatMinutesSeconds } from '../../../shared/lib/format-minutes-seconds';
import { showToast } from '../../../shared/lib/toast-store';
import { MicIcon } from '../../../shared/ui/icons';
import { useRealtimeEvent } from '../../../shared/realtime/use-realtime-event';
import {
  useCall,
  useEndCall,
  useEndVoiceMatch,
  useLikeCall,
  voiceMatchKeys,
} from '../api';
import { friendChatKeys } from '../../friend-chat/api';
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

function HeartIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg
      width={22}
      height={22}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      {...props}
    >
      <path d="M20.8 4.6a5.5 5.5 0 00-7.8 0L12 5.7l-1.1-1.1a5.5 5.5 0 10-7.8 7.8L12 21l8.9-8.6a5.5 5.5 0 000-7.8z" />
    </svg>
  );
}

const END_REASON_LABEL: Record<string, string> = {
  completed: 'Đã kết thúc',
  free_limit: 'Hết thời lượng miễn phí',
  insufficient_balance: 'Không đủ diamond',
  pending_timeout: 'Không ai vào phòng kịp',
};

function isClosedVoiceMatchError(error: unknown): boolean {
  return (
    isApiError(error) &&
    (error.code === 'CALLING_CALL_ENDED' ||
      error.code === 'CALLING_SESSION_NOT_CALLABLE' ||
      error.code === 'CALLING_SESSION_NOT_FOUND')
  );
}

export function VoiceCallRoom({ matchSessionId }: { matchSessionId: string }) {
  const queryClient = useQueryClient();
  const router = useRouter();
  const { connect, room, callId, roomDisconnected, isConnecting, error } =
    useCallRoom(matchSessionId);
  const call = useCall(callId);
  const endCall = useEndCall(callId ?? '');
  const endVoiceMatch = useEndVoiceMatch(matchSessionId);
  const likeCall = useLikeCall(callId ?? '');
  const [isMuted, setIsMuted] = useState(false);
  // Giữ xác nhận ngay trong UI thay vì chỉ dựa vào mutation cache. Điều này cũng tránh
  // mất trạng thái nút tim khi query Call refetch trong lúc đang gọi.
  const [hasLikedCall, setHasLikedCall] = useState(false);
  const audioContainerRef = useRef<HTMLDivElement>(null);
  const [now, setNow] = useState(() => Date.now());
  const endVoiceMatchMutate = useRef(endVoiceMatch.mutate);
  endVoiceMatchMutate.current = endVoiceMatch.mutate;

  // Vào đúng Voice Match là xin quyền mic/kết nối ngay; không bắt người dùng bấm thêm một
  // "Bắt đầu" dư thừa. Retry chỉ hiện khi browser/SFU trả lỗi thật.
  useEffect(() => {
    if (room !== null) return;
    connect();
  }, [connect, room]);

  // Không gọi API trong cleanup React: Strict Mode development cố ý mount → cleanup → mount,
  // và cleanup cũ đã đóng session thật ngay khi vừa vào màn. Thay vào đó chỉ bắt hành động rời
  // trang thật: đóng/reload tab (`pagehide`), browser back/forward (`popstate`) hoặc click link
  // điều hướng sang route khác. Endpoint server vẫn idempotent nên các tín hiệu đồng thời an toàn.
  useEffect(
    () => {
      const endVoiceSession = (): void => endVoiceMatchMutate.current();
      const onDocumentClick = (event: MouseEvent): void => {
        if (
          event.defaultPrevented ||
          event.button !== 0 ||
          event.metaKey ||
          event.ctrlKey ||
          event.shiftKey ||
          event.altKey
        ) {
          return;
        }
        const target = event.target;
        if (!(target instanceof Element)) return;
        const link = target.closest<HTMLAnchorElement>('a[href]');
        if (link === null) return;
        const destination = new URL(link.href, window.location.href);
        if (
          destination.origin === window.location.origin &&
          destination.pathname !== window.location.pathname
        ) {
          endVoiceSession();
        }
      };

      window.addEventListener('pagehide', endVoiceSession);
      window.addEventListener('popstate', endVoiceSession);
      document.addEventListener('click', onDocumentClick, true);
      return () => {
        window.removeEventListener('pagehide', endVoiceSession);
        window.removeEventListener('popstate', endVoiceSession);
        document.removeEventListener('click', onDocumentClick, true);
      };
    },
    // Mutation object đổi theo render nên callback được giữ qua ref.
    [],
  );

  // Đồng hồ hiển thị thuần UX — chỉ server (billing tick) mới là nguồn sự thật cho thời lượng
  // tính phí (docs/10 § "Billing tick..."); client không tự trừ tiền theo đồng hồ này.
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);
  const freeCallRemainingSeconds =
    call.data?.freeCallEndsAt !== null &&
    call.data?.freeCallEndsAt !== undefined
      ? Math.max(
          0,
          Math.ceil(
            (new Date(call.data.freeCallEndsAt).getTime() - now) / 1000,
          ),
        )
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
    showToast(next ? 'Đã tắt mic' : 'Đã bật mic');
  };

  const openFriendChat = (friendUserId: string): void => {
    void queryClient.invalidateQueries({ queryKey: friendChatKeys.friends });
    router.replace(`/chat/${friendUserId}`);
  };

  const refreshLikeAndOpenChat = async (): Promise<boolean> => {
    const result = await likeCall.mutateAsync();
    if (result?.liked === true) setHasLikedCall(true);
    if (result?.matched && result.friendUserId !== null) {
      openFriendChat(result.friendUserId);
      return true;
    }
    return false;
  };

  const handleEndCall = (): void => {
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
        // Người này đã bấm tim trong call: gọi lại reaction idempotent sau end để đọc kết quả
        // mutual mới nhất. Không tự gửi like cho người chưa đồng ý.
        if (hasLikedCall || likeCall.data?.liked === true) {
          if (await refreshLikeAndOpenChat()) return;
        }
        router.replace('/matching');
      } catch {
        showToast('Không thể kết thúc cuộc gọi, hãy thử lại.');
      }
    })();
  };

  const handleLikeCall = (): void => {
    void (async () => {
      try {
        const result = await likeCall.mutateAsync();
        if (result?.liked === true) setHasLikedCall(true);
        if (result?.matched !== true) {
          showToast('Đã gửi yêu thích — chờ đối phương');
          return;
        }
        showToast('Đã Litfriend! Kết thúc cuộc gọi để mở chat riêng.');
      } catch {
        showToast('Không thể gửi yêu thích, hãy thử lại.');
      }
    })();
  };

  const handleEndedLikeCall = (): void => {
    void (async () => {
      try {
        if (await refreshLikeAndOpenChat()) return;
        showToast('Đã gửi yêu thích — chờ đối phương');
      } catch {
        showToast('Không thể gửi yêu thích, hãy thử lại.');
      }
    })();
  };

  if (room === null) {
    if (isClosedVoiceMatchError(error)) {
      return (
        <div className="flex flex-col items-center px-8 pb-10 pt-6 text-center">
          <div className="mb-5 flex h-20 w-20 items-center justify-center rounded-full bg-slate-100 dark:bg-surf2">
            <EndCallIcon
              width={26}
              height={26}
              className="text-slate-400 dark:text-slate-300"
            />
          </div>
          <h2 className="font-display mb-2 text-2xl font-semibold italic">
            Phiên ghép đôi đã kết thúc
          </h2>
          <p className="mb-8 text-sm text-slate-500 dark:text-slate-400">
            Người kia đã rời phiên. Bạn có thể ghép đôi lại ngay.
          </p>
          <Link
            href="/matching"
            className="w-full rounded-full bg-irisl py-3 text-center font-bold text-white"
          >
            Tìm Voice Match mới
          </Link>
        </div>
      );
    }
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
        {isConnecting ? (
          <p className="text-sm font-semibold text-muted-foreground dark:text-white/70">
            Đang kết nối cuộc gọi…
          </p>
        ) : (
          <button
            type="button"
            className="w-full rounded-full bg-gradient-to-br from-irisl to-irisl py-3 font-bold text-white shadow-lg shadow-iris/30"
            onClick={connect}
          >
            Thử kết nối lại
          </button>
        )}
      </div>
    );
  }

  if (call.data?.status === 'ended') {
    const c = call.data;
    const reasonLabel =
      c.endReason !== null
        ? (END_REASON_LABEL[c.endReason] ?? c.endReason)
        : 'Cuộc gọi đã kết thúc';
    return (
      <div className="flex flex-col items-center px-8 pb-10 pt-6 text-center">
        <div className="mb-5 flex h-20 w-20 items-center justify-center rounded-full bg-slate-100 dark:bg-surf2">
          <EndCallIcon
            width={26}
            height={26}
            className="text-slate-400 dark:text-slate-300"
          />
        </div>
        <h2 className="font-display mb-2 text-2xl font-semibold italic">
          {reasonLabel}
        </h2>
        <p className="mb-8 text-sm text-slate-500 dark:text-slate-400">
          {c.durationSeconds !== null
            ? `Đã trò chuyện ${c.durationSeconds}s`
            : 'Không sao — thử một cuộc gọi khác nhé.'}
        </p>
        {callId !== null && (
          <button
            type="button"
            className="mb-3 w-full rounded-full bg-irisl py-3 font-bold text-white disabled:opacity-50"
            disabled={likeCall.isPending}
            onClick={handleEndedLikeCall}
          >
            {likeCall.data?.matched
              ? 'Mở chat với Litfriend'
              : hasLikedCall || likeCall.data?.liked
                ? 'Đã gửi yêu thích — chờ đối phương'
                : likeCall.isPending
                  ? 'Đang gửi yêu thích…'
                  : 'Yêu thích để làm bạn'}
          </button>
        )}
        <Link
          href="/matching"
          className="w-full rounded-full border border-black/10 py-3 text-center font-bold dark:border-white/10"
        >
          Tìm Voice Match mới
        </Link>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center px-8 pb-10 pt-2 text-center">
      {/* Audio đối phương — không cần hiển thị, chỉ cần phát */}
      <div ref={audioContainerRef} className="hidden" />

      {freeCallRemainingSeconds !== null && (
        <p className="mb-4 text-sm font-bold text-irisl dark:text-rose-200">
          Còn {formatMinutesSeconds(freeCallRemainingSeconds)} cho phiên này
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
          className={`flex h-14 w-14 items-center justify-center rounded-full transition disabled:cursor-default ${
            hasLikedCall || likeCall.data?.liked
              ? 'bg-iris/15 text-irisl opacity-75'
              : 'bg-gradient-to-br from-irisl to-aqual text-white shadow-lg shadow-iris/30'
          }`}
          disabled={
            likeCall.isPending ||
            hasLikedCall ||
            likeCall.data?.liked === true ||
            call.data?.status !== 'active'
          }
          onClick={handleLikeCall}
        >
          <HeartIcon
            className={
              hasLikedCall || likeCall.data?.liked ? 'fill-current' : undefined
            }
          />
          <span className="sr-only">
            {likeCall.isPending
              ? 'Đang gửi yêu thích…'
              : hasLikedCall || likeCall.data?.liked
                ? 'Đã yêu thích'
                : 'Yêu thích để thành Litfriend'}
          </span>
        </button>
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
          className="flex h-14 w-14 items-center justify-center rounded-full bg-rose-500 shadow-lg shadow-rose-500/30 disabled:opacity-50"
          disabled={endCall.isPending || likeCall.isPending}
          onClick={handleEndCall}
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
