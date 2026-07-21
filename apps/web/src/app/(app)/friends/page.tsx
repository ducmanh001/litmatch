import { FriendsList } from '../../../features/friend-chat/components/friends-list';

import type { Metadata } from 'next';

// Mockup layouts/web/messages.html gọi màn này là "Tin nhắn" — route vẫn là /friends nhưng
// title/nav label đều đã đổi khớp mockup.
export const metadata: Metadata = { title: 'Tin nhắn' };

export default function FriendsPage() {
  return (
    <section className="mx-auto w-full max-w-2xl min-w-0 px-5 dark:text-white">
      <FriendsList />
    </section>
  );
}
