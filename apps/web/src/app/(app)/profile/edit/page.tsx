import { EditProfileView } from '../../../../features/profile/components/edit-profile-view';

import type { Metadata } from 'next';

export const metadata: Metadata = { title: 'Chỉnh sửa hồ sơ' };

export default function EditProfilePage() {
  return (
    <div className="mx-auto w-full max-w-xl min-w-0">
      <EditProfileView />
    </div>
  );
}
