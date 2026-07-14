import { ProfileView } from '../../../features/profile/components/profile-view';

import type { Metadata } from 'next';

export const metadata: Metadata = { title: 'Hồ sơ' };

export default function ProfilePage() {
  return (
    <section className="space-y-6 px-5">
      <h1 className="font-display pt-2 text-2xl font-semibold italic">
        Hồ sơ của tôi
      </h1>
      <ProfileView />
    </section>
  );
}
