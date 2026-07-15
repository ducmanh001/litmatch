import { PostList } from '../../../features/feed/components/post-list';
import { FeedSidebar } from './feed-sidebar';

import type { Metadata } from 'next';

export const metadata: Metadata = { title: 'Bảng tin' };

export default function FeedPage() {
  return (
    <section>
      <div className="flex items-center justify-between px-5 pt-6 pb-4">
        <h1 className="font-display text-2xl font-semibold italic">Bảng tin</h1>
        <button
          type="button"
          className="flex h-9 w-9 items-center justify-center rounded-full bg-gradient-to-br from-irisl to-irisl text-white"
        >
          <svg
            width={16}
            height={16}
            viewBox="0 0 24 24"
            fill="none"
            stroke="white"
            strokeWidth={2.5}
            aria-hidden
          >
            <path d="M12 5v14M5 12h14" strokeLinecap="round" />
          </svg>
        </button>
      </div>
      {/* lg+: 2 cột kiểu Twitter/Facebook (feed + gợi ý) — 1 cột hẹp trôi giữa khoảng trắng
          1200px của khung app trông trống trải, không giống nền tảng thật nào. */}
      <div className="px-5 lg:grid lg:grid-cols-[1fr_320px] lg:items-start lg:gap-6">
        <PostList />
        <div className="hidden lg:block">
          <FeedSidebar />
        </div>
      </div>
    </section>
  );
}
