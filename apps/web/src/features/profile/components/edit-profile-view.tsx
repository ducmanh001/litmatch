'use client';

import { isApiError } from '@litmatch/api-client';
import Link from 'next/link';

import { useCurrentUser } from '../../../shared/auth/use-current-user';
import { ProfileForm, PROFILE_FORM_ID } from './profile-form';

import type { SVGProps } from 'react';

function BackIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg
      width={16}
      height={16}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2.5}
      aria-hidden
      {...props}
    >
      <path d="M15 18l-6-6 6-6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function PencilIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg
      width={14}
      height={14}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2.5}
      aria-hidden
      {...props}
    >
      <path
        d="M12 20h9M16.5 3.5a2.1 2.1 0 013 3L7 19l-4 1 1-4z"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

/** /profile/edit — đúng layouts/web/litmatch-full/edit-profile.html. Đổi ảnh đại diện chưa có
 * endpoint upload thật (`MyProfileDto.avatarId` chỉ phục vụ hệ avatar layer/equip riêng, không
 * phải upload ảnh) — affordance để "sắp có", không bịa luồng upload. */
export function EditProfileView() {
  const profile = useCurrentUser();

  return (
    <div>
      <div className="flex items-center justify-between px-5 pb-4 pt-6">
        <Link
          href="/profile"
          aria-label="Quay lại hồ sơ"
          className="flex h-9 w-9 items-center justify-center rounded-full bg-slate-100 dark:bg-surf2"
        >
          <BackIcon />
        </Link>
        <h1 className="font-display text-xl font-semibold italic">
          Chỉnh sửa hồ sơ
        </h1>
        <button
          type="submit"
          form={PROFILE_FORM_ID}
          className="px-2 text-sm font-bold text-irisl"
        >
          Lưu
        </button>
      </div>

      {profile.isPending && (
        <p className="px-5 text-sm text-slate-500 dark:text-slate-400">
          Đang tải…
        </p>
      )}

      {profile.isError && (
        <p role="alert" className="px-5 text-sm text-destructive">
          {isApiError(profile.error)
            ? profile.error.message
            : 'Có lỗi xảy ra, thử lại.'}
        </p>
      )}

      {profile.data !== undefined && (
        <>
          <div className="mb-6 flex flex-col items-center">
            <div className="relative h-24 w-24">
              <div
                aria-hidden
                className="flex h-24 w-24 items-center justify-center rounded-full border-4 border-paper bg-gradient-to-br from-irisl to-aqual text-3xl font-bold text-white dark:border-ink"
              >
                {profile.data.nickname.charAt(0).toUpperCase()}
              </div>
              <button
                type="button"
                disabled
                aria-label="Đổi ảnh đại diện (sắp có)"
                className="absolute bottom-0 right-0 flex h-8 w-8 items-center justify-center rounded-full border-2 border-paper bg-irisl text-white opacity-50 dark:border-ink"
              >
                <PencilIcon />
              </button>
            </div>
            <button
              type="button"
              disabled
              className="mt-3 text-sm font-bold text-irisl opacity-50"
            >
              Đổi ảnh đại diện (sắp có)
            </button>
          </div>

          <div className="px-5 pb-10">
            <ProfileForm profile={profile.data} />
          </div>
        </>
      )}
    </div>
  );
}
