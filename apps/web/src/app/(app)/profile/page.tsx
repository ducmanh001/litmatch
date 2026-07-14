import { ProfileView } from '../../../features/profile/components/profile-view';

import type { Metadata } from 'next';

export const metadata: Metadata = { title: 'Hồ sơ' };

export default function ProfilePage() {
  return (
    <section className="space-y-4">
      <h1 className="text-2xl font-semibold">Hồ sơ của tôi</h1>
      <ProfileView />
    </section>
  );
}
