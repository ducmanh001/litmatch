import { FriendsIcon } from '../../../shared/ui/icons';
import { PageHeader } from '../../../shared/ui/page-header';
import { FriendsList } from '../../../features/friend-chat/components/friends-list';

import type { Metadata } from 'next';

// Mockup layouts/web/messages.html gọi màn này là "Tin nhắn" — route vẫn là /friends nhưng
// title/nav label đều đã đổi khớp mockup.
export const metadata: Metadata = { title: 'Tin nhắn' };

export default function FriendsPage() {
  return (
    <section className="mx-auto w-full max-w-2xl min-w-0 space-y-1 px-5 dark:text-white">
      <PageHeader
        eyebrow="Trò chuyện riêng tư"
        eyebrowIcon={<FriendsIcon width={16} height={16} />}
      />
      <FriendsList />
    </section>
  );
}
