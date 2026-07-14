import { FriendsList } from '../../../features/friend-chat/components/friends-list';

import type { Metadata } from 'next';

export const metadata: Metadata = { title: 'Bạn bè' };

export default function FriendsPage() {
  return (
    <section className="space-y-1 px-5">
      <h1 className="font-display pb-4 pt-2 text-2xl font-semibold italic">
        Bạn bè
      </h1>
      <FriendsList />
    </section>
  );
}
