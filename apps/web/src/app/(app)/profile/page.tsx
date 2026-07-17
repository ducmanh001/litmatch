import { ProfileView } from '../../../features/profile/components/profile-view';

import type { Metadata } from 'next';

export const metadata: Metadata = { title: 'Hồ sơ' };

export default function ProfilePage() {
  return (
    <div className="mx-auto w-full max-w-2xl min-w-0">
      <ProfileView />
    </div>
  );
}
