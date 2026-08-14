'use client';

import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';

import { confirmAction } from '../../../shared/lib/confirm-store';
import { MatchIcon, MicIcon } from '../../../shared/ui/icons';

import type { TicketDto } from '../api';

const MATCH_COPY = {
  soul: {
    title: 'Bắt đầu trò chuyện ẩn danh?',
    message:
      'Litmatch sẽ tìm một người phù hợp để hai bạn trò chuyện ẩn danh. Bạn có thể dừng tìm kiếm trước khi ghép được.',
    actionLabel: 'Bắt đầu tìm Soul Match',
  },
  voice: {
    title: 'Bắt đầu kết nối bằng voice?',
    message:
      'Litmatch sẽ tìm một người phù hợp để mở phòng voice riêng. Microphone chỉ được dùng sau khi bạn vào phòng.',
    actionLabel: 'Bắt đầu tìm Voice Match',
  },
} as const;

const ACTION_BASE_CLASS =
  'inline-flex h-13 min-h-13 w-full items-center justify-center gap-2 rounded-full px-5 text-sm font-extrabold transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-iris';
const ACTION_SELECTED_CLASS = {
  soul: 'bg-gradient-to-r from-aqua to-irisl text-white shadow-md shadow-iris/30',
  voice: 'bg-irisl text-white shadow-md shadow-iris/30',
} as const;
const ACTION_UNSELECTED_CLASS =
  'border border-iris/20 bg-card/70 text-foreground hover:bg-iris/[0.04] dark:border-white/15 dark:bg-white/[0.05] dark:text-white dark:hover:bg-white/10';

function actionClass(
  matchType: TicketDto['matchType'],
  current: TicketDto['matchType'],
) {
  return `${ACTION_BASE_CLASS} ${
    matchType === current
      ? ACTION_SELECTED_CLASS[matchType]
      : ACTION_UNSELECTED_CLASS
  }`;
}

/** Chọn loại ghép đôi. Hai breakpoint dùng cùng state và cùng kích thước CTA. */
export function MatchActions() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const current: TicketDto['matchType'] =
    searchParams.get('match') === 'voice' ? 'voice' : 'soul';

  const select = async (matchType: TicketDto['matchType']) => {
    router.replace(`/matching?match=${matchType}`);
    const copy = MATCH_COPY[matchType];
    const confirmed = await confirmAction({
      ...copy,
      content: (
        <p className="mb-5 rounded-2xl bg-iris/[0.06] px-3 py-2 text-xs leading-5 text-muted-foreground dark:bg-white/[0.06] dark:text-white/70">
          Radar chỉ minh hoạ quá trình quét; hệ thống không hiển thị danh tính
          hoặc vị trí chính xác của người đang chờ.
        </p>
      ),
    });
    if (confirmed) router.replace(`/matching?match=${matchType}&start=1`);
  };

  return (
    <>
      <div className="flex w-full flex-col gap-3 md:hidden">
        <button
          type="button"
          aria-pressed={current === 'soul'}
          onClick={() => void select('soul')}
          className={actionClass('soul', current)}
        >
          <MatchIcon width={17} height={17} />
          Nhắn tin ẩn danh
        </button>
        <button
          type="button"
          aria-pressed={current === 'voice'}
          onClick={() => void select('voice')}
          className={actionClass('voice', current)}
        >
          <MicIcon width={17} height={17} />
          Kết nối bằng voice
        </button>
      </div>

      <div className="hidden w-full max-w-64 flex-col gap-3 md:flex md:shrink-0">
        <Link
          href="/matching?match=soul#match-queue"
          aria-current={current === 'soul' ? 'page' : undefined}
          className={actionClass('soul', current)}
        >
          <MatchIcon width={17} height={17} />
          Nhắn tin ẩn danh
        </Link>
        <Link
          href="/matching?match=voice#match-queue"
          aria-current={current === 'voice' ? 'page' : undefined}
          className={actionClass('voice', current)}
        >
          <MicIcon width={17} height={17} />
          Kết nối bằng voice
        </Link>
      </div>
    </>
  );
}
