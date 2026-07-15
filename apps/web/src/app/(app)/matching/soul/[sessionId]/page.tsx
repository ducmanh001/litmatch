import Link from 'next/link';

import { SoulChatPhaseView } from '../../../../../features/soul-match/components/soul-chat-phase-view';
import { SoulCountdownBadge } from '../../../../../features/soul-match/components/soul-countdown-badge';
import { ChevronLeftIcon } from '../../../../../shared/ui/icons';

import type { Metadata } from 'next';

export const metadata: Metadata = { title: 'Soul Match' };

export default async function SoulMatchPage({
  params,
}: {
  params: Promise<{ sessionId: string }>;
}) {
  const { sessionId } = await params;
  return (
    <section className="flex flex-1 flex-col">
      <div className="flex shrink-0 items-center justify-between px-5 pb-4 pt-6">
        <Link
          href="/matching"
          className="flex h-9 w-9 items-center justify-center rounded-full bg-slate-100 dark:bg-surf2"
        >
          <ChevronLeftIcon />
        </Link>
        <p className="text-sm font-bold">Soul Match</p>
        <SoulCountdownBadge sessionId={sessionId} />
      </div>
      <SoulChatPhaseView sessionId={sessionId} />
    </section>
  );
}
