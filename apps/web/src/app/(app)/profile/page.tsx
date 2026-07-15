import { ProfileView } from '../../../features/profile/components/profile-view';

import type { Metadata } from 'next';

export const metadata: Metadata = { title: 'Hồ sơ' };

export default function ProfilePage() {
  return <ProfileView />;
}
