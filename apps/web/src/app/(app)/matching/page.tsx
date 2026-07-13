import { QueueStatusPanel } from '../../../features/matching/components/queue-status-panel';

import type { Metadata } from 'next';

export const metadata: Metadata = { title: 'Ghép đôi' };

export default function MatchingPage() {
  return (
    <section className="mx-auto max-w-md space-y-4">
      <h1 className="text-2xl font-semibold">Ghép đôi</h1>
      <QueueStatusPanel />
    </section>
  );
}
