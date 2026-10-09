import { FriendsDirectory } from '../../../features/friend-chat/components/friends-directory';

import type { Metadata } from 'next';

export const metadata: Metadata = { title: 'Bạn bè' };

export default function FriendsPage() {
  return (
    <div className="mx-auto w-full max-w-2xl min-w-0">
      <FriendsDirectory />
    </div>
  );
}
