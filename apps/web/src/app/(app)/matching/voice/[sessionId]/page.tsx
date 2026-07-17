import Link from 'next/link';

import { VoiceCallRoom } from '../../../../../features/voice-match/components/voice-call-room';

import type { Metadata } from 'next';

export const metadata: Metadata = { title: 'Voice Match' };

export default async function VoiceMatchPage({
  params,
}: {
  params: Promise<{ sessionId: string }>;
}) {
  const { sessionId } = await params;
  return (
    <div className="flex flex-1 flex-col">
      <div className="mb-2 flex shrink-0 items-center justify-between px-5">
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
            aria-hidden
          >
            <path
              d="M15 18l-6-6 6-6"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </Link>
        <p className="text-sm font-bold">Voice Match</p>
        <div className="h-9 w-9" />
      </div>
      <VoiceCallRoom matchSessionId={sessionId} />
    </div>
  );
}
