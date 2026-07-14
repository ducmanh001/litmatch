import { PostList } from '../../../features/feed/components/post-list';

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
      <div className="px-5">
        <PostList />
      </div>
    </section>
  );
}
