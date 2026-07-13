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
    <section className="mx-auto max-w-md space-y-4">
      <h1 className="text-2xl font-semibold">Gọi thoại</h1>
      <VoiceCallRoom matchSessionId={sessionId} />
    </section>
  );
}
