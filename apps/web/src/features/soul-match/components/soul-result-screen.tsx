'use client';

import Link from 'next/link';

import { useSoulPartner } from '../api';

import type { SoulVerdict } from '../api';

type ResultKind = 'matched' | 'like' | 'passed';

const RESULT_COPY: Record<
  ResultKind,
  { icon: string; title: string; text: string }
> = {
  matched: {
    icon: '🎉',
    title: 'Đã trở thành bạn!',
    text: 'Cả hai đã thích nhau — hồ sơ đã mở khoá, tiếp tục trò chuyện trong Tin nhắn.',
  },
  like: {
    icon: '🎉',
    title: 'Đã gửi lượt thích!',
    text: 'Nếu họ cũng thích bạn, hồ sơ sẽ mở khoá và cuộc trò chuyện chuyển vào Tin nhắn.',
  },
  passed: {
    icon: '👋',
    title: 'Đã bỏ qua',
    text: 'Không sao cả — luôn có người phù hợp hơn ở lượt ghép tiếp theo.',
  },
};

/** Màn hình kết quả toàn màn hình (soul-match.html `#resultState`) — thay cho banner inline cũ.
 * Dùng lại đúng state đã có: `myVerdict` (kết quả hành động thích/bỏ qua) + `matched` (live check
 * Friendship) — không tạo state hay gọi API mới. */
export function SoulResultScreen({
  sessionId,
  verdict,
  matched,
}: {
  sessionId: string;
  verdict: SoulVerdict;
  matched: boolean;
}) {
  const partner = useSoulPartner(sessionId, matched);
  const kind: ResultKind = matched
    ? 'matched'
    : verdict === 'like'
      ? 'like'
      : 'passed';
  const copy = RESULT_COPY[kind];
  const partnerName = matched ? partner.data?.nickname : undefined;

  return (
    <div className="flex flex-1 flex-col items-center justify-center px-8 text-center">
      <div className="mb-5 text-5xl" aria-hidden>
        {copy.icon}
      </div>
      <h2 className="font-display mb-2 text-2xl font-semibold italic">
        {copy.title}
      </h2>
      <p className="mb-8 text-sm text-slate-500 dark:text-slate-400">
        {partnerName !== undefined
          ? `Bạn và ${partnerName} đã trở thành bạn — tiếp tục trò chuyện trong Tin nhắn.`
          : copy.text}
      </p>
      <div className="flex w-full flex-col gap-3">
        <Link
          href="/matching"
          className="w-full rounded-full bg-gradient-to-br from-irisl to-irisl py-3 text-center text-sm font-bold text-white shadow-lg shadow-iris/30"
        >
          Tìm người khác
        </Link>
        <Link
          href="/home"
          className="w-full rounded-full border border-black/10 py-3 text-center text-sm font-bold dark:border-white/10"
        >
          Về trang chủ
        </Link>
      </div>
    </div>
  );
}
