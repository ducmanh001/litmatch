import { FriendsList } from '../../../features/friend-chat/components/friends-list';

import type { Metadata } from 'next';

export const metadata: Metadata = { title: 'Bạn bè' };

export default function FriendsPage() {
  return (
    <section className="mx-auto max-w-md space-y-4">
      <h1 className="text-2xl font-semibold">Bạn bè</h1>
      <FriendsList />
    </section>
  );
}
