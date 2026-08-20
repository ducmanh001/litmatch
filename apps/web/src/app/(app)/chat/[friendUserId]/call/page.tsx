import { FriendCallRoom } from '../../../../../features/friend-chat/components/friend-call-room';

import type { Metadata } from 'next';

export const metadata: Metadata = { title: 'Cuộc gọi' };

export default async function FriendCallPage({
  params,
}: {
  params: Promise<{ friendUserId: string }>;
}) {
  const { friendUserId } = await params;
  return (
    <div className="flex min-h-[calc(100dvh-8rem)] flex-1 flex-col">
      <FriendCallRoom friendUserId={friendUserId} />
    </div>
  );
}
