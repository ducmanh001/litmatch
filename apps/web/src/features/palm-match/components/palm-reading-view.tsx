'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';

import {
  useCurrentPalmMatch,
  useDismissPalmMatch,
  useFlipPalmCard,
  useJoinPalmQueue,
  useRatePalmMatch,
} from '../api';
import { cn } from '../../../shared/lib/cn';

import type { PalmMatchStateDto } from '../api';

type ZodiacSign = NonNullable<PalmMatchStateDto['mySign']>;

const RESULT_COPY: Record<
  NonNullable<PalmMatchStateDto['outcome']>,
  { icon: string; title: string; text: string }
> = {
  matched: {
    icon: '🎉',
    title: 'Hai bạn cùng thích nhau!',
    text: 'Hồ sơ đã được mở khoá và hai bạn có thể bắt đầu trò chuyện.',
  },
  not_matched: {
    icon: '👋',
    title: 'Lượt bói đã kết thúc',
    text: 'Không sao cả — luôn có người phù hợp hơn ở lượt bói tiếp theo.',
  },
  expired: {
    icon: '⌛',
    title: 'Đã hết thời gian',
    text: 'Lượt ghép đã đóng để không ai phải chờ vô hạn.',
  },
  cancelled: {
    icon: '🌙',
    title: 'Người ấy đã rời lượt bói',
    text: 'Bạn có thể bắt đầu một lượt mới ngay bây giờ.',
  },
};

/** Palm Match hai phía: toàn bộ queue/flip/kết quả/rating lấy từ REST state của server. */
export function PalmReadingView() {
  const router = useRouter();
  const current = useCurrentPalmMatch();
  const join = useJoinPalmQueue();
  const flip = useFlipPalmCard();
  const rate = useRatePalmMatch();
  const dismiss = useDismissPalmMatch();
  const autoJoinStarted = useRef(false);
  const [showFortune, setShowFortune] = useState(false);

  const state = current.data;

  useEffect(() => {
    if (state?.state !== 'idle' || autoJoinStarted.current || join.isPending) {
      return;
    }
    autoJoinStarted.current = true;
    join.mutate(undefined, {
      onError: () => {
        autoJoinStarted.current = false;
      },
    });
  }, [join, state?.state]);

  useEffect(() => {
    setShowFortune(false);
  }, [state?.sessionId]);

  async function cancelAndGoHome() {
    try {
      await dismiss.mutateAsync(undefined);
      router.push('/home');
    } catch {
      // Mutation giữ ApiError để InlineError render; không điều hướng khi server chưa huỷ.
    }
  }

  async function restart() {
    try {
      await dismiss.mutateAsync(undefined);
      setShowFortune(false);
      autoJoinStarted.current = true;
      await join.mutateAsync(undefined);
    } catch {
      autoJoinStarted.current = false;
      // Mutation error được render tại màn hiện tại.
    }
  }

  const error =
    current.error ?? join.error ?? flip.error ?? rate.error ?? dismiss.error;

  if (current.isLoading) {
    return <LoadingState label="Đang khôi phục lượt Palm Match..." />;
  }

  if (current.isError) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center px-8 text-center">
        <div className="mb-4 text-5xl" aria-hidden>
          ⚠️
        </div>
        <h2 className="font-display mb-2 text-2xl font-semibold italic">
          Chưa tải được Palm Match
        </h2>
        <p className="mb-6 text-sm text-red-600">{errorMessage(error)}</p>
        <button
          type="button"
          onClick={() => void current.refetch()}
          className="rounded-full bg-gradient-to-br from-irisl to-aqual px-8 py-3 font-bold text-white"
        >
          Thử lại
        </button>
      </div>
    );
  }

  if (state === undefined) {
    return <LoadingState label="Đang khôi phục lượt Palm Match..." />;
  }

  if (state.state === 'idle' || state.state === 'queued') {
    return (
      <div className="flex flex-1 flex-col items-center justify-center px-8 text-center">
        <div className="relative mb-8 flex h-40 w-40 items-center justify-center">
          <span className="pulsering absolute h-40 w-40 rounded-full border border-iris/40" />
          <span className="pulsering2 absolute h-40 w-40 rounded-full border border-iris/40" />
          <div className="relative z-10 flex h-24 w-24 items-center justify-center rounded-full bg-gradient-to-br from-aqual to-irisl text-4xl">
            🔮
          </div>
        </div>
        <h2 className="font-display mb-2 text-2xl font-semibold italic">
          Đang tìm người để bói cùng...
        </h2>
        <p className="mb-8 text-sm text-slate-500 dark:text-slate-400">
          Ghép ẩn danh rồi mỗi người tự lật bài của mình — chỉ để vui thôi nhé
          😄
        </p>
        <InlineError error={error} />
        <button
          type="button"
          disabled={dismiss.isPending}
          onClick={() => void cancelAndGoHome()}
          className="rounded-full border border-black/10 px-8 py-3 text-sm font-bold transition hover:bg-black/5 disabled:opacity-50 dark:border-white/10 dark:hover:bg-white/5"
        >
          {dismiss.isPending ? 'Đang huỷ...' : 'Huỷ tìm kiếm'}
        </button>
      </div>
    );
  }

  if (state.state === 'completed') {
    const copy = RESULT_COPY[state.outcome ?? 'cancelled'];
    return (
      <div className="flex flex-1 flex-col items-center justify-center px-8 text-center">
        <div className="mb-5 text-5xl" aria-hidden>
          {copy.icon}
        </div>
        <h2 className="font-display mb-2 text-2xl font-semibold italic">
          {copy.title}
        </h2>
        <p className="mb-8 text-sm text-slate-500 dark:text-slate-400">
          {copy.text}
        </p>
        <InlineError error={error} />
        <div className="flex w-full flex-col gap-3">
          {state.partnerUserId ? (
            <Link
              href={`/users/${state.partnerUserId}`}
              className="w-full rounded-full bg-gradient-to-br from-irisl to-aqual py-3 font-bold text-white shadow-lg shadow-iris/30"
            >
              Xem hồ sơ và nhắn tin
            </Link>
          ) : null}
          <button
            type="button"
            disabled={dismiss.isPending || join.isPending}
            onClick={() => void restart()}
            className={cn(
              'w-full rounded-full py-3 font-bold disabled:opacity-50',
              state.partnerUserId
                ? 'border border-black/10 dark:border-white/10'
                : 'bg-gradient-to-br from-irisl to-aqual text-white shadow-lg shadow-iris/30',
            )}
          >
            {dismiss.isPending || join.isPending
              ? 'Đang bắt đầu...'
              : 'Bói với người khác'}
          </button>
          <Link
            href="/home"
            className="w-full rounded-full border border-black/10 py-3 text-center font-bold dark:border-white/10"
          >
            Về trang chủ
          </Link>
        </div>
      </div>
    );
  }

  if (state.myRating === 'like') {
    return (
      <div className="flex flex-1 flex-col items-center justify-center px-8 text-center">
        <div className="relative mb-6 flex h-24 w-24 items-center justify-center rounded-full bg-gradient-to-br from-irisl to-aqual text-4xl">
          💫
        </div>
        <h2 className="font-display mb-2 text-2xl font-semibold italic">
          Đã gửi lượt thích
        </h2>
        <p className="mb-3 text-sm text-slate-500 dark:text-slate-400">
          Đang chờ lựa chọn của người ấy. Hồ sơ chỉ mở nếu cả hai cùng thích.
        </p>
        <SessionCountdown expiresAt={state.expiresAt} />
        <InlineError error={error} />
        <button
          type="button"
          disabled={dismiss.isPending || join.isPending}
          onClick={() => void restart()}
          className="mt-8 rounded-full border border-black/10 px-8 py-3 text-sm font-bold disabled:opacity-50 dark:border-white/10"
        >
          Dừng chờ và bói lượt khác
        </button>
      </div>
    );
  }

  const bothFlipped = Boolean(state.myFlipped && state.opponentFlipped);
  if (bothFlipped && showFortune) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center px-8 text-center">
        <div className="pop-in mb-6 w-full rounded-3xl bg-gradient-to-br from-irisl to-aqual p-6 text-white">
          <p className="mb-2 text-xs font-bold uppercase tracking-wide opacity-80">
            Độ hợp duyên
          </p>
          <p className="font-display mb-1 text-5xl font-semibold">
            {state.compatibilityPercent}%
          </p>
          <p className="text-sm opacity-90">
            {state.mySign?.name} {state.mySign?.symbol} &amp;{' '}
            {state.opponentSign?.name} {state.opponentSign?.symbol}
          </p>
        </div>
        <div className="pop-in mb-8 rounded-2xl border border-black/5 bg-white p-5 dark:border-white/5 dark:bg-surf">
          <p className="text-sm leading-relaxed">“{state.fortune}”</p>
        </div>
        <p className="mb-4 text-sm text-slate-500 dark:text-slate-400">
          Bạn có muốn làm quen thật với người này không?
        </p>
        <InlineError error={error} />
        <div className="grid w-full grid-cols-2 gap-3">
          <button
            type="button"
            disabled={rate.isPending}
            onClick={() =>
              state.sessionId &&
              rate.mutate({ sessionId: state.sessionId, rating: 'skip' })
            }
            className="flex flex-col items-center gap-2 rounded-2xl border border-black/5 bg-white py-4 transition hover:-translate-y-0.5 disabled:opacity-50 dark:border-white/5 dark:bg-surf"
          >
            <span className="text-2xl" aria-hidden>
              😅
            </span>
            <span className="text-xs font-bold">Để lần khác</span>
          </button>
          <button
            type="button"
            disabled={rate.isPending}
            onClick={() =>
              state.sessionId &&
              rate.mutate({ sessionId: state.sessionId, rating: 'like' })
            }
            className="flex flex-col items-center gap-2 rounded-2xl bg-gradient-to-br from-irisl to-aqual py-4 text-white transition hover:-translate-y-0.5 disabled:opacity-50"
          >
            <span className="text-2xl" aria-hidden>
              💫
            </span>
            <span className="text-xs font-bold">
              {rate.isPending ? 'Đang gửi...' : 'Thích'}
            </span>
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-1 flex-col items-center justify-center px-8 text-center">
      <p className="mb-1 text-sm text-slate-500 dark:text-slate-400">
        Đã ghép với
      </p>
      <p className="mb-2 font-bold">Người lạ ẩn danh</p>
      <SessionCountdown expiresAt={state.expiresAt} />
      <div className="mb-8 mt-6 flex items-center justify-center gap-6">
        <FlipCard
          flipped={Boolean(state.myFlipped)}
          disabled={flip.isPending}
          onFlip={() => state.sessionId && flip.mutate(state.sessionId)}
          frontGradient="from-irisl to-aqual"
          borderClass="border-irisl"
          label="Bạn"
          sign={state.mySign}
          ariaLabel="Lật bài của bạn"
        />
        <span className="font-display text-2xl italic text-slate-300 dark:text-slate-600">
          ×
        </span>
        <FlipCard
          flipped={Boolean(state.opponentFlipped)}
          disabled
          frontGradient="from-aqual to-irisl"
          borderClass="border-aqual"
          label="Người ấy"
          sign={state.opponentSign}
          ariaLabel="Bài của người ấy"
        />
      </div>
      <p className="mb-6 text-sm font-semibold text-irisl">
        {bothFlipped
          ? 'Cả hai đã lộ bài rồi!'
          : state.myFlipped
            ? 'Đã lật bài — đang chờ người ấy ✨'
            : 'Chạm vào bàn tay của bạn để lật bài ✨'}
      </p>
      <InlineError error={error} />
      <button
        type="button"
        disabled={!bothFlipped}
        onClick={() => setShowFortune(true)}
        className={cn(
          'w-full rounded-full bg-gradient-to-br from-irisl to-aqual py-3 font-bold text-white shadow-lg shadow-iris/30 transition-opacity',
          !bothFlipped && 'opacity-40',
        )}
      >
        Xem duyên số
      </button>
    </div>
  );
}

function LoadingState({ label }: { label: string }) {
  return (
    <div className="flex flex-1 flex-col items-center justify-center px-8 text-center">
      <div className="mb-5 h-10 w-10 animate-spin rounded-full border-4 border-irisl/20 border-t-irisl" />
      <p className="text-sm font-semibold text-slate-500">{label}</p>
    </div>
  );
}

function SessionCountdown({ expiresAt }: { expiresAt?: string }) {
  const [seconds, setSeconds] = useState(() => remainingSeconds(expiresAt));

  useEffect(() => {
    setSeconds(remainingSeconds(expiresAt));
    if (!expiresAt) return undefined;
    const timer = window.setInterval(
      () => setSeconds(remainingSeconds(expiresAt)),
      1000,
    );
    return () => window.clearInterval(timer);
  }, [expiresAt]);

  if (!expiresAt) return null;
  const minutes = Math.floor(seconds / 60);
  const remainder = String(seconds % 60).padStart(2, '0');
  return (
    <p className="text-xs font-semibold text-slate-400" aria-live="polite">
      Còn {minutes}:{remainder}
    </p>
  );
}

function remainingSeconds(expiresAt?: string): number {
  if (!expiresAt) return 0;
  return Math.max(0, Math.ceil((Date.parse(expiresAt) - Date.now()) / 1000));
}

function InlineError({ error }: { error: unknown }) {
  if (!error) return null;
  return (
    <p className="mb-4 rounded-xl bg-red-50 px-4 py-2 text-xs text-red-700 dark:bg-red-950/30 dark:text-red-300">
      {errorMessage(error)}
    </p>
  );
}

function errorMessage(error: unknown): string {
  return error instanceof Error
    ? error.message
    : 'Có lỗi xảy ra, vui lòng thử lại.';
}

function FlipCard({
  flipped,
  disabled,
  onFlip,
  frontGradient,
  borderClass,
  label,
  sign,
  ariaLabel,
}: {
  flipped: boolean;
  disabled: boolean;
  onFlip?: () => void;
  frontGradient: string;
  borderClass: string;
  label: string;
  sign?: ZodiacSign;
  ariaLabel: string;
}) {
  return (
    <button
      type="button"
      aria-label={ariaLabel}
      aria-pressed={flipped}
      data-flipped={flipped ? 'true' : 'false'}
      disabled={disabled || flipped}
      onClick={onFlip}
      className="flip-card h-36 w-28 disabled:cursor-default"
    >
      <div className="flip-inner h-full w-full">
        <div
          className={cn(
            'flip-front flex h-full w-full items-center justify-center bg-gradient-to-br text-3xl',
            frontGradient,
          )}
        >
          🖐️
        </div>
        <div
          className={cn(
            'flip-back flex h-full w-full flex-col items-center justify-center border-2 bg-white dark:bg-surf',
            borderClass,
          )}
        >
          <span className="mb-1 text-3xl">{sign?.symbol ?? '·'}</span>
          <span className="text-xs font-bold">{label}</span>
        </div>
      </div>
    </button>
  );
}
