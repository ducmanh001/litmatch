import Link from 'next/link';

import { WatchTogetherView } from './watch-together-view';

import type { Metadata } from 'next';

export const metadata: Metadata = { title: 'Movie Match' };

export default async function MovieMatchSessionPage({
  params,
}: {
  params: Promise<{ sessionId: string }>;
}) {
  const { sessionId } = await params;
  return (
    <section className="flex flex-1 flex-col">
      <div className="flex shrink-0 items-center justify-between px-5 pb-4 pt-6">
        <Link
          href="/movie-match"
          aria-label="Quay lại"
          className="flex h-9 w-9 items-center justify-center rounded-full bg-slate-100 dark:bg-surf2"
        >
          <svg
            width={16}
            height={16}
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth={2.5}
            aria-hidden
          >
            <path
              d="M15 18l-6-6 6-6"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </Link>
        <p className="text-sm font-bold">Movie Match</p>
        <div className="h-9 w-9" />
      </div>
      <WatchTogetherView sessionId={sessionId} />
    </section>
  );
}
