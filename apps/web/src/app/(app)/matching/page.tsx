import { IncomingInvites } from '../../../features/matching/components/incoming-invites';
import { QueueStatusPanel } from '../../../features/matching/components/queue-status-panel';

import type { Metadata } from 'next';

export const metadata: Metadata = { title: 'Ghép đôi' };

export default function MatchingPage() {
  return (
    <div className="space-y-6 px-5">
      <h1 className="font-display text-2xl font-semibold italic">Ghép đôi</h1>
      <IncomingInvites />
      <QueueStatusPanel />
    </div>
  );
}
