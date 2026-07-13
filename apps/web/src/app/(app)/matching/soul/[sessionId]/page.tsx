import { SoulChatPhaseView } from '../../../../../features/soul-match/components/soul-chat-phase-view';

import type { Metadata } from 'next';

export const metadata: Metadata = { title: 'Soul Match' };

export default async function SoulMatchPage({
  params,
}: {
  params: Promise<{ sessionId: string }>;
}) {
  const { sessionId } = await params;
  return (
    <section className="mx-auto max-w-md space-y-4">
      <h1 className="text-2xl font-semibold">Chat ẩn danh</h1>
      <SoulChatPhaseView sessionId={sessionId} />
    </section>
  );
}
