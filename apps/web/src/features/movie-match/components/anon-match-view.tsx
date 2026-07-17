'use client';

import { isApiError } from '@litmatch/api-client';
import { RealtimeEvents } from '@litmatch/common-dtos/pure';
import { useEffect, useRef, useState } from 'react';

import { useIdempotencyKey } from '../../../shared/idempotency/use-idempotency-key';
import { showToast } from '../../../shared/lib/toast-store';
import { useRealtimeEvent } from '../../../shared/realtime/use-realtime-event';
import {
  useCurrentMovieAnon,
  useDismissMovieAnon,
  useFinishMovieAnonWatch,
  useJoinMovieAnonQueue,
  useMovieAnonMessages,
  useRateMovieAnon,
  useSendMovieAnonMessage,
  useSendMovieAnonReaction,
  useUpdateMovieAnonState,
} from '../anon-api';
import { YoutubePlayer } from './youtube-player';

import type {
  MovieReactionSentEventData,
  MovieStateChangedEventData,
} from '@litmatch/common-dtos/pure';
import type {
  MovieAnonRating,
  MovieAnonReaction,
  MovieAnonStateDto,
} from '../anon-api';
import type { FormEvent } from 'react';

/** Whitelist reaction đúng movie-match.html — server cũng chặn emoji ngoài danh sách. */
const REACTIONS: readonly MovieAnonReaction[] = ['😂', '😍', '😱', '👏'];

function formatCountdown(expiresAtIso: string, nowMs: number): string {
  const secondsLeft = Math.max(
    0,
    Math.floor((new Date(expiresAtIso).getTime() - nowMs) / 1000),
  );
  const minutes = Math.floor(secondsLeft / 60);
  return `${minutes}:${String(secondsLeft % 60).padStart(2, '0')}`;
}

function SearchingState({ onCancel }: { onCancel: () => void }) {
  return (
    <div className="flex flex-1 flex-col items-center justify-center px-8 py-14 text-center">
      <div className="relative mb-8 flex h-32 w-32 items-center justify-center">
        <span className="pulsering motion-reduce:[animation:none!important] absolute h-28 w-28 rounded-full border border-iris/35" />
        <span className="pulsering2 motion-reduce:[animation:none!important] absolute h-28 w-28 rounded-full border border-iris/25" />
        <div className="relative z-10 flex h-20 w-20 items-center justify-center rounded-full bg-gradient-to-br from-irisl to-aqual text-3xl">
          🎬
        </div>
      </div>
      <h2 className="font-display mb-2 text-2xl font-semibold italic">
        Đang tìm bạn xem cùng...
      </h2>
      <p className="mb-8 text-sm text-slate-500 dark:text-slate-400">
        Ghép bạn với người cùng gu phim để xem chung một clip ngắn và trò chuyện
        trực tiếp.
      </p>
      <button
        type="button"
        onClick={onCancel}
        className="rounded-full border border-black/10 px-8 py-3 text-sm font-bold transition hover:bg-black/5 dark:border-white/10 dark:hover:bg-white/5"
      >
        Huỷ tìm kiếm
      </button>
    </div>
  );
}

function AnonChat({ sessionId }: { sessionId: string }) {
  const messages = useMovieAnonMessages(sessionId, true);
  const sendMessage = useSendMovieAnonMessage(sessionId);
  const { key, resetKey } = useIdempotencyKey();
  const [draft, setDraft] = useState('');
  const { hasNextPage, isFetchingNextPage, fetchNextPage } = messages;

  // Cursor chỉ tiến (afterSeq) — tự kéo tới trang mới nhất, cùng pattern MessageList friend chat
  useEffect(() => {
    if (hasNextPage && !isFetchingNextPage) void fetchNextPage();
  }, [hasNextPage, isFetchingNextPage, fetchNextPage]);

  const items = messages.data?.pages.flatMap((page) => page?.items ?? []) ?? [];

  const onSubmit = (event: FormEvent) => {
    event.preventDefault();
    const content = draft.trim();
    if (content === '') return;
    sendMessage.mutate(
      { content, idempotencyKey: key },
      {
        onSuccess: () => {
          setDraft('');
          resetKey();
        },
        onError: (error) =>
          showToast(
            isApiError(error) ? error.message : 'Không gửi được tin nhắn.',
            'warn',
          ),
      },
    );
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <ul className="flex-1 space-y-3 overflow-y-auto px-5 py-4">
        {items.map((message) => (
          <li
            key={message.id}
            className={`flex ${message.sender === 'me' ? 'justify-end' : ''}`}
          >
            <span
              className={
                message.sender === 'me'
                  ? 'max-w-[75%] rounded-2xl rounded-tr-md bg-gradient-to-br from-irisl to-aqual px-4 py-2.5 text-sm text-white [overflow-wrap:anywhere]'
                  : 'max-w-[75%] rounded-2xl rounded-tl-md bg-slate-100 px-4 py-2.5 text-sm dark:bg-surf2 [overflow-wrap:anywhere]'
              }
            >
              {message.content}
            </span>
          </li>
        ))}
        {items.length === 0 && !messages.isPending && (
          <li className="text-center text-xs text-slate-400">
            Nhắn gì đó để bắt đầu trò chuyện nhé!
          </li>
        )}
      </ul>
      <form
        className="flex shrink-0 gap-2 border-t border-black/5 px-5 py-4 dark:border-white/5"
        onSubmit={onSubmit}
      >
        <input
          type="text"
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          aria-label="Nhắn khi đang xem"
          placeholder="Nhắn khi đang xem..."
          className="min-w-0 flex-1 rounded-full bg-slate-100 px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-iris dark:bg-surf2"
        />
        <button
          type="submit"
          disabled={sendMessage.isPending}
          aria-label="Gửi"
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-irisl to-aqual text-white disabled:opacity-50"
        >
          <svg
            width={15}
            height={15}
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth={2.2}
            aria-hidden
          >
            <path
              d="M22 2L11 13M22 2l-7 20-4-9-9-4z"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </button>
      </form>
    </div>
  );
}

function WatchingState({ state }: { state: MovieAnonStateDto }) {
  const sessionId = state.sessionId as string;
  const updateState = useUpdateMovieAnonState(sessionId);
  const finishWatch = useFinishMovieAnonWatch(sessionId);
  const sendReaction = useSendMovieAnonReaction(sessionId);
  const [nowMs, setNowMs] = useState(() => Date.now());
  const [floatingReactions, setFloatingReactions] = useState<
    Array<{ id: number; emoji: string }>
  >([]);
  const reactionIdRef = useRef(0);

  useEffect(() => {
    const timer = setInterval(() => setNowMs(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);

  const showFloatingReaction = (emoji: string) => {
    const id = ++reactionIdRef.current;
    setFloatingReactions((current) => [...current, { id, emoji }]);
    setTimeout(
      () =>
        setFloatingReactions((current) =>
          current.filter((item) => item.id !== id),
        ),
      1800,
    );
  };

  // Reaction của CẢ HAI đến qua realtime (server publish cho cả 2) — chỉ hiệu ứng, mất là thôi
  useRealtimeEvent<MovieReactionSentEventData>(
    RealtimeEvents.MovieReactionSent,
    (data) => {
      if (data.sessionId === sessionId) showFloatingReaction(data.emoji);
    },
  );

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex shrink-0 items-center gap-3 border-b border-black/5 px-5 pb-3 dark:border-white/5">
        <span className="flex h-9 w-9 items-center justify-center rounded-full bg-surf2 text-lg">
          🎭
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-bold">Người lạ ẩn danh</p>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Cùng xem và trò chuyện — hồ sơ chỉ mở khi cả hai Thích
          </p>
        </div>
        {state.expiresAt !== undefined && (
          <span className="shrink-0 rounded-full bg-iris/15 px-3 py-1.5 text-xs font-extrabold text-irisl">
            {formatCountdown(state.expiresAt, nowMs)}
          </span>
        )}
        <button
          type="button"
          disabled={finishWatch.isPending}
          onClick={() => finishWatch.mutate(undefined)}
          className="shrink-0 text-xs font-bold text-rose-500 disabled:opacity-50"
        >
          Kết thúc
        </button>
      </div>

      <div className="relative shrink-0 px-5 pt-4">
        <div className="relative w-full overflow-hidden rounded-2xl">
          <YoutubePlayer
            videoUrl={state.videoUrl ?? ''}
            positionSeconds={state.positionSeconds ?? 0}
            isPlaying={state.isPlaying ?? false}
            positionUpdatedAt={state.positionUpdatedAt ?? ''}
            onLocalStateChange={(positionSeconds, isPlaying) =>
              updateState.mutate({ positionSeconds, isPlaying })
            }
          />
          <span
            aria-hidden
            className="pointer-events-none absolute inset-0 overflow-hidden"
          >
            {floatingReactions.map((reaction) => (
              <span
                key={reaction.id}
                className="animate-bounce absolute bottom-4 left-1/2 -translate-x-1/2 text-3xl"
              >
                {reaction.emoji}
              </span>
            ))}
          </span>
        </div>
        <div className="mt-3 flex items-center justify-center gap-3">
          {REACTIONS.map((emoji) => (
            <button
              key={emoji}
              type="button"
              aria-label={`Thả ${emoji}`}
              onClick={() =>
                sendReaction.mutate(emoji, {
                  onError: () => showToast('Không gửi được reaction.', 'warn'),
                })
              }
              className="h-9 w-9 rounded-full border border-black/5 bg-white text-lg transition active:scale-90 dark:border-white/5 dark:bg-surf"
            >
              {emoji}
            </button>
          ))}
        </div>
      </div>

      <AnonChat sessionId={sessionId} />
    </div>
  );
}

function RatingState({ state }: { state: MovieAnonStateDto }) {
  const sessionId = state.sessionId as string;
  const rate = useRateMovieAnon(sessionId);

  const onRate = (rating: MovieAnonRating) =>
    rate.mutate(rating, {
      onError: (error) =>
        showToast(
          isApiError(error) ? error.message : 'Không gửi được đánh giá.',
          'warn',
        ),
    });

  if (state.myRating !== undefined) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center px-8 py-14 text-center">
        <div className="mb-5 text-5xl" aria-hidden>
          ⏳
        </div>
        <h2 className="font-display mb-2 text-2xl font-semibold italic">
          Đang chờ người kia đánh giá…
        </h2>
        <p className="text-sm text-slate-500 dark:text-slate-400">
          Nếu cả hai cùng chọn “Thích”, hồ sơ thật sẽ được mở khoá.
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-1 flex-col items-center justify-center px-8 py-14 text-center">
      <span className="mb-5 flex h-20 w-20 items-center justify-center rounded-full bg-surf2 text-3xl">
        🎭
      </span>
      <h2 className="font-display mb-2 text-2xl font-semibold italic">
        Bạn thấy người này thế nào?
      </h2>
      <p className="mb-8 text-sm text-slate-500 dark:text-slate-400">
        Nếu cả hai cùng chọn “Thích”, hồ sơ thật sẽ được mở khoá.
      </p>
      <div className="grid w-full grid-cols-3 gap-3">
        <button
          type="button"
          disabled={rate.isPending}
          onClick={() => onRate('rude')}
          className="flex flex-col items-center gap-2 rounded-2xl border border-black/5 bg-white py-4 transition hover:-translate-y-0.5 disabled:opacity-50 dark:border-white/5 dark:bg-surf"
        >
          <span className="text-2xl">😠</span>
          <span className="text-xs font-bold">Thô lỗ</span>
        </button>
        <button
          type="button"
          disabled={rate.isPending}
          onClick={() => onRate('boring')}
          className="flex flex-col items-center gap-2 rounded-2xl border border-black/5 bg-white py-4 transition hover:-translate-y-0.5 disabled:opacity-50 dark:border-white/5 dark:bg-surf"
        >
          <span className="text-2xl">😐</span>
          <span className="text-xs font-bold">Nhàm chán</span>
        </button>
        <button
          type="button"
          disabled={rate.isPending}
          onClick={() => onRate('like')}
          className="flex flex-col items-center gap-2 rounded-2xl bg-gradient-to-br from-irisl to-aqual py-4 text-white transition hover:-translate-y-0.5 disabled:opacity-50"
        >
          <span className="text-2xl">🎬</span>
          <span className="text-xs font-bold">Thích</span>
        </button>
      </div>
    </div>
  );
}

function CompletedState({
  state,
  onRestart,
}: {
  state: MovieAnonStateDto;
  onRestart: () => void;
}) {
  const matched = state.outcome === 'matched';
  const liked = state.myRating === 'like';

  return (
    <div className="flex flex-1 flex-col items-center justify-center px-8 py-14 text-center">
      <div className="mb-5 text-5xl" aria-hidden>
        {matched ? '🎉' : liked ? '💌' : '👋'}
      </div>
      <h2 className="font-display mb-2 text-2xl font-semibold italic">
        {matched
          ? 'Hai bạn đã thích nhau!'
          : liked
            ? 'Đã gửi lượt thích!'
            : 'Đã bỏ qua'}
      </h2>
      <p className="mb-8 text-sm text-slate-500 dark:text-slate-400">
        {matched
          ? 'Hồ sơ đã mở khoá — cuộc trò chuyện chuyển vào Tin nhắn.'
          : liked
            ? 'Nếu họ cũng thích bạn, hồ sơ sẽ mở khoá và cuộc trò chuyện chuyển vào Tin nhắn.'
            : 'Không sao cả — luôn có người phù hợp hơn ở lượt ghép tiếp theo.'}
      </p>
      <div className="flex w-full flex-col gap-3">
        {matched && state.partnerUserId !== undefined && (
          <a
            href={`/chat/${state.partnerUserId}`}
            className="w-full rounded-full bg-gradient-to-br from-irisl to-aqual py-3 text-center font-bold text-white shadow-lg shadow-iris/30"
          >
            Nhắn tin ngay
          </a>
        )}
        <button
          type="button"
          onClick={onRestart}
          className={
            matched
              ? 'w-full rounded-full border border-black/10 py-3 font-bold dark:border-white/10'
              : 'w-full rounded-full bg-gradient-to-br from-irisl to-aqual py-3 font-bold text-white shadow-lg shadow-iris/30'
          }
        >
          Xem phim khác
        </button>
      </div>
    </div>
  );
}

/**
 * State machine 4 màn của Movie Match ẩn danh (movie-match.html): search → watch → rating →
 * result. TOÀN BỘ state từ server (poll useCurrentMovieAnon) — client không tự sinh đối thủ,
 * kết quả hay đồng hồ; realtime chỉ là delta (playback/reaction).
 */
export function AnonMatchView({ onIdle }: { onIdle?: () => void }) {
  const current = useCurrentMovieAnon();
  const joinQueue = useJoinMovieAnonQueue();
  const dismiss = useDismissMovieAnon();

  // Playback realtime của đối phương — gợi ý refetch sớm, poll vẫn là fallback
  useRealtimeEvent<MovieStateChangedEventData>(
    RealtimeEvents.MovieStateChanged,
    (data) => {
      if (data.sessionId === current.data?.sessionId) void current.refetch();
    },
  );

  if (current.isPending) {
    return (
      <p className="px-5 py-10 text-center text-sm text-slate-500 dark:text-slate-400">
        Đang tải…
      </p>
    );
  }
  if (current.isError) {
    return (
      <p
        role="alert"
        className="px-5 py-10 text-center text-sm text-destructive"
      >
        {isApiError(current.error)
          ? current.error.message
          : 'Có lỗi xảy ra, thử lại.'}
      </p>
    );
  }

  const state = current.data;
  if (state === undefined) return null;

  const restart = () =>
    dismiss.mutate(undefined, {
      onSuccess: () => joinQueue.mutate(undefined),
    });

  switch (state.state) {
    case 'queued':
      return <SearchingState onCancel={() => dismiss.mutate(undefined)} />;
    case 'watching':
      return <WatchingState state={state} />;
    case 'rating':
      return <RatingState state={state} />;
    case 'completed':
      return <CompletedState state={state} onRestart={restart} />;
    default:
      onIdle?.();
      return (
        <div className="flex flex-col items-center px-8 py-10 text-center">
          <div className="mb-6 flex h-20 w-20 items-center justify-center rounded-full bg-gradient-to-br from-irisl to-aqual text-3xl">
            🎬
          </div>
          <h2 className="font-display mb-2 text-2xl font-semibold italic">
            Xem phim cùng người lạ
          </h2>
          <p className="mb-6 text-sm text-slate-500 dark:text-slate-400">
            Ghép ngẫu nhiên với người cùng gu phim — xem chung một clip ngắn,
            trò chuyện ẩn danh, thích nhau thì mở hồ sơ.
          </p>
          <button
            type="button"
            disabled={joinQueue.isPending}
            onClick={() => joinQueue.mutate(undefined)}
            className="rounded-full bg-gradient-to-br from-irisl to-aqual px-8 py-3 text-sm font-bold text-white shadow-lg shadow-iris/30 disabled:opacity-50"
          >
            {joinQueue.isPending ? 'Đang vào hàng chờ…' : 'Tìm bạn xem cùng'}
          </button>
        </div>
      );
  }
}
