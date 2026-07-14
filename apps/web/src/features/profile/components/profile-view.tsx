'use client';

import { isApiError } from '@litmatch/api-client';

import { useCurrentUser } from '../../../shared/auth/use-current-user';
import { ProfileForm } from './profile-form';

export function ProfileView() {
  const profile = useCurrentUser();

  if (profile.isPending) {
    return (
      <p className="text-sm text-slate-500 dark:text-slate-400">
        Đang tải hồ sơ…
      </p>
    );
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
      <p className="text-sm text-slate-500 dark:text-slate-400">
        Không có dữ liệu hồ sơ.
      </p>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <div
          aria-hidden
          className="flex h-[72px] w-[72px] shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-irisl to-aqual text-2xl font-bold text-white"
        >
          {profile.data.nickname.charAt(0).toUpperCase()}
        </div>
        <h2 className="font-display truncate text-xl font-semibold italic">
          {profile.data.nickname}
        </h2>
      </div>
      {profile.data.isGuest && (
        <p className="rounded-2xl bg-slate-100 px-4 py-3 text-sm text-slate-500 dark:bg-surf2 dark:text-slate-400">
          Tài khoản khách — một số tính năng bị giới hạn.
        </p>
      )}
      <ProfileForm profile={profile.data} />
    </div>
  );
}
