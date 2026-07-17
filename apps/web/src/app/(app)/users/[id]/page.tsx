import { PublicProfileView } from '../../../../features/profile/components/public-profile-view';

import type { Metadata } from 'next';

export const metadata: Metadata = { title: 'Hồ sơ người dùng' };

export default async function PublicProfilePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return (
    <div className="mx-auto w-full max-w-2xl min-w-0">
      <PublicProfileView userId={id} />
    </div>
  );
}
