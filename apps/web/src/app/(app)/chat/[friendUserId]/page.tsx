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
    <div className="mx-auto w-full max-w-xl min-w-0">
      <ConversationThread friendUserId={friendUserId} />
    </div>
  );
}
