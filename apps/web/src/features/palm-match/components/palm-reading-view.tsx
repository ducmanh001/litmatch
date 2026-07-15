'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';

import { cn } from '../../../shared/lib/cn';

type RateKind = 'like' | 'skip';

interface ZodiacSign {
  symbol: string;
  name: string;
}

const ZODIAC_SIGNS: readonly ZodiacSign[] = [
  { symbol: '♈', name: 'Bạch Dương' },
  { symbol: '♉', name: 'Kim Ngưu' },
  { symbol: '♊', name: 'Song Tử' },
  { symbol: '♋', name: 'Cự Giải' },
  { symbol: '♌', name: 'Sư Tử' },
  { symbol: '♍', name: 'Xử Nữ' },
  { symbol: '♎', name: 'Thiên Bình' },
  { symbol: '♏', name: 'Bọ Cạp' },
  { symbol: '♐', name: 'Nhân Mã' },
  { symbol: '♑', name: 'Ma Kết' },
  { symbol: '♒', name: 'Bảo Bình' },
  { symbol: '♓', name: 'Song Ngư' },
];

const FORTUNE_TEMPLATES: readonly string[] = [
  'Một người mộng mơ gặp một người rực rỡ — hai bạn hợp nhau ở chỗ biết lắng nghe và biết toả sáng đúng lúc. Thử rủ nhau đi xem hoàng hôn xem sao 🌅',
  'Một tâm hồn thích ổn định gặp một tâm hồn thích khám phá — nghe trái ngược nhưng lại bổ sung cho nhau rất đáng yêu 🌿',
  'Cả hai đều sống tình cảm — dễ đồng cảm, chỉ cần nhường nhau một chút lúc tranh luận 💬',
  'Một cặp năng lượng cao — hợp đi chơi xa, hợp thử món mới, chỉ cần đừng cùng bận rộn một lúc 🎈',
  'Trầm tính gặp trầm tính — không cần nói nhiều vẫn hiểu nhau, chỉ cần chủ động rủ nhau trước 🍃',
];

const RESULT_COPY: Record<
  RateKind,
  { icon: string; title: string; text: string }
> = {
  like: {
    icon: '🎉',
    title: 'Đã gửi lượt thích!',
    text: 'Nếu họ cũng thích bạn, hồ sơ sẽ mở khoá và cuộc trò chuyện chuyển vào Tin nhắn.',
  },
  skip: {
    icon: '👋',
    title: 'Đã bỏ qua',
    text: 'Không sao cả — luôn có người phù hợp hơn ở lượt bói tiếp theo.',
  },
};

const SEARCH_DELAY_MS = 2600;

interface PalmMatchResult {
  mySign: ZodiacSign;
  theirSign: ZodiacSign;
  percent: number;
  fortune: string;
}

function pickRandom<T>(items: readonly T[]): T {
  return items[Math.floor(Math.random() * items.length)];
}

function createRandomMatch(): PalmMatchResult {
  return {
    mySign: pickRandom(ZODIAC_SIGNS),
    theirSign: pickRandom(ZODIAC_SIGNS),
    percent: 60 + Math.floor(Math.random() * 40),
    fortune: pickRandom(FORTUNE_TEMPLATES),
  };
}

type FlowState =
  | { step: 'searching' }
  | {
      step: 'reveal';
      match: PalmMatchResult;
      flippedMe: boolean;
      flippedThem: boolean;
    }
  | { step: 'fortune'; match: PalmMatchResult }
  | { step: 'result'; rate: RateKind };

/** UI ghép cặp ẩn danh/flip-card/% hợp duyên khớp layouts/web/palm-match.html — quyết định sản
 * phẩm 2026-07-15 dựng lại có chủ đích làm demo tĩnh (state cục bộ, không gọi API ghép cặp thật),
 * đè quyết định "bỏ hẳn phần này" ghi ở docs/07-roadmap.md § Frontend track (2026-07-14). */
export function PalmReadingView() {
  const [flow, setFlow] = useState<FlowState>({ step: 'searching' });

  useEffect(() => {
    if (flow.step !== 'searching') return undefined;
    const timer = setTimeout(() => {
      setFlow({
        step: 'reveal',
        match: createRandomMatch(),
        flippedMe: false,
        flippedThem: false,
      });
    }, SEARCH_DELAY_MS);
    return () => clearTimeout(timer);
  }, [flow.step]);

  function flipCard(which: 'me' | 'them') {
    setFlow((prev) => {
      if (prev.step !== 'reveal') return prev;
      return which === 'me'
        ? { ...prev, flippedMe: true }
        : { ...prev, flippedThem: true };
    });
  }

  function restart() {
    setFlow({ step: 'searching' });
  }

  if (flow.step === 'searching') {
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
          Ghép ẩn danh rồi cùng lật bài xem duyên số hai bạn thế nào — chỉ để
          vui thôi nhé 😄
        </p>
        <Link
          href="/home"
          className="rounded-full border border-black/10 px-8 py-3 text-sm font-bold transition hover:bg-black/5 dark:border-white/10 dark:hover:bg-white/5"
        >
          Huỷ tìm kiếm
        </Link>
      </div>
    );
  }

  if (flow.step === 'reveal') {
    const { match, flippedMe, flippedThem } = flow;
    const bothFlipped = flippedMe && flippedThem;
    return (
      <div className="flex flex-1 flex-col items-center justify-center px-8 text-center">
        <p className="mb-1 text-sm text-slate-500 dark:text-slate-400">
          Đã ghép với
        </p>
        <p className="mb-6 font-bold">Người lạ ẩn danh</p>
        <div className="mb-8 flex items-center justify-center gap-6">
          <FlipCard
            flipped={flippedMe}
            onFlip={() => flipCard('me')}
            frontGradient="from-irisl to-aqual"
            borderClass="border-irisl"
            label="Bạn"
            sign={match.mySign}
            ariaLabel="Lật bài của bạn"
          />
          <span className="font-display text-2xl italic text-slate-300 dark:text-slate-600">
            ×
          </span>
          <FlipCard
            flipped={flippedThem}
            onFlip={() => flipCard('them')}
            frontGradient="from-aqual to-irisl"
            borderClass="border-aqual"
            label="Người ấy"
            sign={match.theirSign}
            ariaLabel="Lật bài của người ấy"
          />
        </div>
        <p className="mb-8 text-sm font-semibold text-irisl">
          {bothFlipped
            ? 'Cả hai đã lộ bài rồi!'
            : 'Chạm vào từng bàn tay để lật bài ✨'}
        </p>
        <button
          type="button"
          disabled={!bothFlipped}
          onClick={() => setFlow({ step: 'fortune', match })}
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

  if (flow.step === 'fortune') {
    const { match } = flow;
    return (
      <div className="flex flex-1 flex-col items-center justify-center px-8 text-center">
        <div className="pop-in mb-6 w-full rounded-3xl bg-gradient-to-br from-irisl to-aqual p-6 text-white">
          <p className="mb-2 text-xs font-bold uppercase tracking-wide opacity-80">
            Độ hợp duyên
          </p>
          <p className="font-display mb-1 text-5xl font-semibold">
            {match.percent}%
          </p>
          <p className="text-sm opacity-90">
            {match.mySign.name} {match.mySign.symbol} &amp;{' '}
            {match.theirSign.name} {match.theirSign.symbol}
          </p>
        </div>
        <div
          className="pop-in mb-8 rounded-2xl border border-black/5 bg-white p-5 dark:border-white/5 dark:bg-surf"
          style={{ animationDelay: '.15s' }}
        >
          <p className="text-sm leading-relaxed">"{match.fortune}"</p>
        </div>
        <p className="mb-4 text-sm text-slate-500 dark:text-slate-400">
          Bạn có muốn làm quen thật với người này không?
        </p>
        <div className="grid w-full grid-cols-2 gap-3">
          <button
            type="button"
            onClick={() => setFlow({ step: 'result', rate: 'skip' })}
            className="flex flex-col items-center gap-2 rounded-2xl border border-black/5 bg-white py-4 transition hover:-translate-y-0.5 dark:border-white/5 dark:bg-surf"
          >
            <span className="text-2xl" aria-hidden>
              😅
            </span>
            <span className="text-xs font-bold">Để lần khác</span>
          </button>
          <button
            type="button"
            onClick={() => setFlow({ step: 'result', rate: 'like' })}
            className="flex flex-col items-center gap-2 rounded-2xl bg-gradient-to-br from-irisl to-aqual py-4 text-white transition hover:-translate-y-0.5"
          >
            <span className="text-2xl" aria-hidden>
              💫
            </span>
            <span className="text-xs font-bold">Thích</span>
          </button>
        </div>
      </div>
    );
  }

  const copy = RESULT_COPY[flow.rate];
  return (
    <div className="flex flex-1 flex-col items-center justify-center px-8 text-center">
      <div className="mb-5 text-5xl">{copy.icon}</div>
      <h2 className="font-display mb-2 text-2xl font-semibold italic">
        {copy.title}
      </h2>
      <p className="mb-8 text-sm text-slate-500 dark:text-slate-400">
        {copy.text}
      </p>
      <div className="flex w-full flex-col gap-3">
        <button
          type="button"
          onClick={restart}
          className="w-full rounded-full bg-gradient-to-br from-irisl to-aqual py-3 font-bold text-white shadow-lg shadow-iris/30"
        >
          Bói với người khác
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

function FlipCard({
  flipped,
  onFlip,
  frontGradient,
  borderClass,
  label,
  sign,
  ariaLabel,
}: {
  flipped: boolean;
  onFlip: () => void;
  frontGradient: string;
  borderClass: string;
  label: string;
  sign: ZodiacSign;
  ariaLabel: string;
}) {
  return (
    <button
      type="button"
      aria-label={ariaLabel}
      aria-pressed={flipped}
      data-flipped={flipped ? 'true' : 'false'}
      disabled={flipped}
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
          <span className="mb-1 text-3xl">{sign.symbol}</span>
          <span className="text-xs font-bold">{label}</span>
        </div>
      </div>
    </button>
  );
}
