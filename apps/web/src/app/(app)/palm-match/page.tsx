import Link from 'next/link';

import { PalmReadingView } from '../../../features/palm-match/components/palm-reading-view';

import type { Metadata } from 'next';

export const metadata: Metadata = { title: 'Palm Match' };

export default function PalmMatchPage() {
  return (
    <div className="flex min-h-[70vh] flex-col">
      <div className="flex shrink-0 items-center justify-between px-5 pb-4 pt-6">
        <Link
          href="/home"
          className="flex h-9 w-9 items-center justify-center rounded-full bg-slate-100 dark:bg-surf2"
        >
          <svg
            width={16}
            height={16}
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth={2.5}
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden
          >
            <path d="M15 18l-6-6 6-6" />
          </svg>
        </Link>
        <p className="text-sm font-bold">Palm Match</p>
        <div className="h-9 w-9" />
      </div>
      <PalmReadingView />
    </div>
  );
}
