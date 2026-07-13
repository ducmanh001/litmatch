import { ConversationThread } from '../../../../features/friend-chat/components/conversation-thread';

import type { Metadata } from 'next';

export const metadata: Metadata = { title: 'Chat' };

export default async function ChatPage({
  params,
}: {
  params: Promise<{ friendUserId: string }>;
}) {
  const { friendUserId } = await params;
  return (
    <section className="mx-auto max-w-md space-y-4">
      <ConversationThread friendUserId={friendUserId} />
    </section>
  );
}
