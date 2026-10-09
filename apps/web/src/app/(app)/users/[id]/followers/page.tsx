import { FollowListView } from '../../../../../features/profile/components/follow-list-view';

import type { Metadata } from 'next';

export const metadata: Metadata = { title: 'Người theo dõi' };

export default async function FollowersPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return (
    <div className="mx-auto w-full max-w-2xl min-w-0">
      <FollowListView userId={id} kind="followers" />
    </div>
  );
}
