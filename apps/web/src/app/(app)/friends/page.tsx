import { FriendsList } from '../../../features/friend-chat/components/friends-list';
import { DiscoveryIcon } from '../../../shared/ui/icons';

import type { Metadata } from 'next';

// Mockup layouts/web/messages.html gọi màn này là "Tin nhắn" (đúng nav item đang active) —
// giữ tiêu đề khớp mockup dù nav sidebar dùng nhãn "Bạn bè" cho route /friends.
export const metadata: Metadata = { title: 'Tin nhắn' };

export default function FriendsPage() {
  return (
    <section className="space-y-1 px-5">
      <div className="flex items-center justify-between pb-4 pt-2">
        <h1 className="font-display text-2xl font-semibold italic">Tin nhắn</h1>
        {/* Tìm kiếm hội thoại: chưa có endpoint search nào ở tầng data — nút hiện tại chỉ để
            khớp layout mockup, chưa có hành vi (docs/13: không fabricate logic không có thật). */}
        <button
          type="button"
          disabled
          aria-label="Tìm kiếm (sắp có)"
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-slate-100 opacity-60 dark:bg-surf2"
        >
          <DiscoveryIcon width={16} height={16} />
        </button>
      </div>
      <FriendsList />
    </section>
  );
}
