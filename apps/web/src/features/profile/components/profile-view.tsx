'use client';

import { isApiError } from '@litmatch/api-client';

import { useCurrentUser } from '../../../shared/auth/use-current-user';
import { ProfileForm } from './profile-form';

export function ProfileView() {
  const profile = useCurrentUser();

  if (profile.isPending) {
    return <p className="text-sm text-muted-foreground">Đang tải hồ sơ…</p>;
  }

  if (profile.isError) {
    const message = isApiError(profile.error)
      ? profile.error.message
      : 'Có lỗi xảy ra, thử lại.';
    return (
      <p role="alert" className="text-sm text-destructive">
        {message}
      </p>
    );
  }

  if (profile.data === undefined) {
    return (
      <p className="text-sm text-muted-foreground">Không có dữ liệu hồ sơ.</p>
    );
  }

  return (
    <div className="space-y-4">
      {profile.data.isGuest && (
        <p className="rounded-md bg-card px-3 py-2 text-sm text-muted-foreground">
          Tài khoản khách — một số tính năng bị giới hạn.
        </p>
      )}
      <ProfileForm profile={profile.data} />
    </div>
  );
}
