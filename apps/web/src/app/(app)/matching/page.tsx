import Link from 'next/link';

import { IncomingInvites } from '../../../features/matching/components/incoming-invites';
import { QueueStatusPanel } from '../../../features/matching/components/queue-status-panel';
import { ChevronLeftIcon } from '../../../shared/ui/icons';

import type { Metadata } from 'next';

export const metadata: Metadata = { title: 'Ghép đôi' };

export default function MatchingPage() {
  return (
    <section className="flex min-h-[calc(100vh-9rem)] flex-col">
      <div className="flex shrink-0 items-center justify-between px-5 pb-4">
        <Link
          href="/home"
          className="flex h-9 w-9 items-center justify-center rounded-full bg-slate-100 dark:bg-surf2"
        >
          <ChevronLeftIcon />
        </Link>
        <p className="text-sm font-bold">Ghép đôi</p>
        <div className="h-9 w-9" />
      </div>
      <div className="flex flex-1 flex-col px-5">
        <IncomingInvites />
        <QueueStatusPanel />
      </div>
    </section>
  );
}
