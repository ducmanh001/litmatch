import { FriendsList } from '../../../features/friend-chat/components/friends-list';

import type { Metadata } from 'next';

// Mockup layouts/web/messages.html gọi màn này là "Tin nhắn" (đúng nav item đang active) —
// giữ tiêu đề khớp mockup dù nav sidebar dùng nhãn "Bạn bè" cho route /friends.
export const metadata: Metadata = { title: 'Tin nhắn' };

export default function FriendsPage() {
  return (
    <section className="mx-auto w-full max-w-2xl min-w-0 space-y-1 px-5 dark:text-white">
      <div className="pb-4 pt-2">
        <h1 className="font-display text-2xl font-semibold italic">Tin nhắn</h1>
      </div>
      <FriendsList />
    </section>
  );
}
