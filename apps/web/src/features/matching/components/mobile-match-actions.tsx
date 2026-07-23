'use client';

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

/** CTA riêng cho mobile: chọn loại → xác nhận qua ConfirmSheet → mới thêm `start=1` để
 * QueueStatusPanel gửi request vào queue. */
export function MobileMatchActions() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const current = searchParams.get('match') || 'soul';

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
    <div className="flex flex-col gap-3 md:hidden">
      <button
        type="button"
        aria-pressed={current === 'soul'}
        onClick={() => void select('soul')}
        className={`inline-flex w-full items-center justify-center gap-2 rounded-full px-5 py-4 text-sm font-extrabold transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-iris ${
          current === 'soul'
            ? 'bg-gradient-to-r from-aqua to-irisl text-white shadow-md shadow-iris/30'
            : 'border border-iris/20 bg-card/70 text-foreground hover:bg-iris/[0.04] dark:border-white/15 dark:bg-white/[0.05] dark:text-white dark:hover:bg-white/10'
        }`}
      >
        <MatchIcon width={17} height={17} />
        Nhắn tin ẩn danh
      </button>
      <button
        type="button"
        aria-pressed={current === 'voice'}
        onClick={() => void select('voice')}
        className={`inline-flex w-full items-center justify-center gap-2 rounded-full px-5 py-4 text-sm font-extrabold transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-iris ${
          current === 'voice'
            ? 'bg-irisl text-white shadow-md shadow-iris/30'
            : 'border border-iris/20 bg-card/70 text-foreground hover:bg-iris/[0.04] dark:border-white/15 dark:bg-white/[0.05] dark:text-white dark:hover:bg-white/10'
        }`}
      >
        <MicIcon width={17} height={17} />
        Kết nối bằng voice
      </button>
    </div>
  );
}
