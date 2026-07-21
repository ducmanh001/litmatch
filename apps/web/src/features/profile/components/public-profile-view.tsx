'use client';

import { isApiError } from '@litmatch/api-client';
import Link from 'next/link';

import { PlaceholderAvatar } from '../../../shared/ui/placeholder-avatar';
import { useCreateInvite } from '../../matching/invite-api';
import { usePublicProfile } from '../api';
import { showToast } from '../../../shared/lib/toast-store';

import type { PublicProfileDto } from '../api';

export function PublicProfileView({ userId }: { userId: string }) {
  const profile = usePublicProfile(userId);
  const createInvite = useCreateInvite();

  if (profile.isPending) {
    return <p className="px-5 text-sm text-slate-500">Đang tải hồ sơ…</p>;
  }
  if (profile.error !== null) {
    return (
      <p role="alert" className="px-5 text-sm text-destructive">
        {isApiError(profile.error)
          ? profile.error.message
          : 'Không thể tải hồ sơ.'}
      </p>
    );
  }
  const profileData = profile.data;
  if (profileData === undefined) return null;

  const invite = (matchType: 'voice' | 'soul') => {
    createInvite.mutate(
      { inviteeUserId: profileData.id, matchType },
      {
        onSuccess: () =>
          showToast(
            `Đã gửi lời mời ${matchType === 'voice' ? 'Voice' : 'Soul'} Match`,
          ),
        onError: (error) =>
          showToast(
            isApiError(error) ? error.message : 'Không thể gửi lời mời.',
            'warn',
          ),
      },
    );
  };

  return (
    <div className="-mt-4">
      <div className="relative h-28 bg-gradient-to-br from-irisl to-iris">
        <Link
          href="/friends"
          aria-label="Quay lại"
          className="absolute left-5 top-6 flex h-9 w-9 items-center justify-center rounded-full bg-white/20 text-xl text-white backdrop-blur"
        >
          ‹
        </Link>
      </div>
      <div className="relative -mt-10 px-5">
        <PlaceholderAvatar
          seed={profileData.id}
          alt={profileData.nickname}
          size={96}
          className="border-paper dark:border-ink border-4"
        />
        <h1 className="font-display mt-3 text-xl font-semibold italic">
          {profileData.nickname}
        </h1>
        <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
          {genderLabel(profileData.gender)}
        </p>
        {(profileData.interests?.length ?? 0) > 0 && (
          <div className="mt-3 flex flex-wrap gap-2">
            {profileData.interests?.map((tag) => (
              <span
                key={tag}
                className="rounded-full bg-iris/10 px-2.5 py-1 text-[11px] font-semibold text-irisl dark:bg-white/10 dark:text-white/85"
              >
                {tag}
              </span>
            ))}
          </div>
        )}
        <div className="mt-6 grid grid-cols-2 gap-3">
          <button
            type="button"
            disabled={createInvite.isPending}
            onClick={() => invite('voice')}
            className="rounded-2xl bg-iris px-4 py-3 text-sm font-bold text-white disabled:opacity-50"
          >
            🎙 Voice Match
          </button>
          <button
            type="button"
            disabled={createInvite.isPending}
            onClick={() => invite('soul')}
            className="rounded-2xl bg-rose-500 px-4 py-3 text-sm font-bold text-white disabled:opacity-50"
          >
            💞 Soul Match
          </button>
        </div>
      </div>
    </div>
  );
}

function genderLabel(gender: PublicProfileDto['gender']): string {
  if (gender === 'male') return 'Nam';
  if (gender === 'female') return 'Nữ';
  if (gender === 'other') return 'Giới tính khác';
  return 'Không công khai giới tính';
}
