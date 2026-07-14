'use client';

import { isApiError } from '@litmatch/api-client';

import { FriendAvatar } from '../../friend-chat/components/friend-avatar';
import { useChangeRole, useUserProfiles } from '../api';

import type { PartyRoomMemberDto } from '../api';

/** Chặn fan-out profile query không giới hạn — audience không có cap ở backend như speaker. */
const MAX_AUDIENCE_LISTED = 20;

function EmptySeat() {
  return (
    <div className="flex flex-col items-center">
      <div className="mb-1 flex h-14 w-14 items-center justify-center rounded-full border-2 border-dashed border-slate-300 text-slate-300 dark:border-white/15 dark:text-white/20">
        <svg
          width={18}
          height={18}
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth={2}
          aria-hidden
        >
          <path d="M12 5v14M5 12h14" strokeLinecap="round" />
        </svg>
      </div>
      <p className="text-[11px] text-slate-400">Trống</p>
    </div>
  );
}

export function MemberList({
  roomId,
  members,
  isHost,
  speakerLimit,
}: {
  roomId: string;
  members: PartyRoomMemberDto[];
  isHost: boolean;
  /** Tổng số ghế nói (kể cả host) — chỉ dùng để vẽ ô "Trống" trang trí, không có thì bỏ qua. */
  speakerLimit?: number;
}) {
  const host = members.find((m) => m.role === 'host');
  const speakers = members.filter((m) => m.role === 'speaker');
  const audience = members.filter((m) => m.role === 'audience');
  // Chỉ host mới cần thấy từng khán giả (để mời lên nói) — non-host chỉ thấy số lượng.
  const listedAudience = isHost ? audience.slice(0, MAX_AUDIENCE_LISTED) : [];
  const emptySeatCount =
    speakerLimit !== undefined
      ? Math.max(0, speakerLimit - 1 - speakers.length)
      : 0;

  const profileIds = [
    host?.userId,
    ...speakers.map((s) => s.userId),
    ...listedAudience.map((a) => a.userId),
  ].filter((id): id is string => id !== undefined);
  const profiles = useUserProfiles(profileIds);
  const nicknameById = new Map(
    profileIds.map((id, index) => [id, profiles[index]?.data?.nickname]),
  );

  const changeRole = useChangeRole(roomId);
  const message = isApiError(changeRole.error)
    ? changeRole.error.message
    : changeRole.error != null
      ? 'Có lỗi xảy ra, thử lại.'
      : undefined;

  return (
    <div className="space-y-5 px-6">
      {host !== undefined && (
        <div className="flex flex-col items-center">
          <div className="relative mb-2 flex h-20 w-20 items-center justify-center">
            {nicknameById.get(host.userId) !== undefined ? (
              <FriendAvatar
                userId={host.userId}
                nickname={nicknameById.get(host.userId) ?? ''}
                size={80}
              />
            ) : (
              <div className="h-20 w-20 rounded-full bg-slate-100 dark:bg-surf2" />
            )}
            <span className="absolute -bottom-1 right-0 rounded-full bg-gradient-to-br from-irisl to-irisl px-2 py-0.5 text-[9px] font-extrabold text-white">
              HOST
            </span>
          </div>
          <p className="text-xs font-bold">
            {nicknameById.get(host.userId) ?? '…'}
          </p>
        </div>
      )}

      {(speakers.length > 0 || emptySeatCount > 0) && (
        <div className="grid grid-cols-3 gap-x-4 gap-y-3 lg:grid-cols-4">
          {speakers.map((speaker) => (
            <div key={speaker.userId} className="flex flex-col items-center">
              <div className="mb-1">
                {nicknameById.get(speaker.userId) !== undefined ? (
                  <FriendAvatar
                    userId={speaker.userId}
                    nickname={nicknameById.get(speaker.userId) ?? ''}
                    size={56}
                  />
                ) : (
                  <div className="h-14 w-14 rounded-full bg-slate-100 dark:bg-surf2" />
                )}
              </div>
              <p className="w-16 truncate text-center text-[11px] font-semibold">
                {nicknameById.get(speaker.userId) ?? '…'}
              </p>
              {isHost && (
                <button
                  type="button"
                  className="text-[10px] text-slate-400 underline disabled:opacity-50"
                  disabled={changeRole.isPending}
                  onClick={() =>
                    changeRole.mutate({
                      userId: speaker.userId,
                      role: 'audience',
                    })
                  }
                >
                  Chuyển xuống khán giả
                </button>
              )}
            </div>
          ))}
          {Array.from({ length: emptySeatCount }).map((_, index) => (
            <EmptySeat key={`empty-${index}`} />
          ))}
        </div>
      )}

      {isHost && audience.length > 0 ? (
        <div className="space-y-2 rounded-2xl border border-black/5 bg-white p-3 dark:border-white/5 dark:bg-surf">
          <p className="text-xs font-bold uppercase tracking-wide text-slate-400 dark:text-slate-500">
            Khán giả ({audience.length})
          </p>
          <ul className="space-y-1.5">
            {listedAudience.map((member) => (
              <li
                key={member.userId}
                className="flex items-center justify-between text-sm"
              >
                <span>{nicknameById.get(member.userId) ?? '…'}</span>
                <button
                  type="button"
                  className="text-xs font-semibold text-irisl disabled:opacity-50"
                  disabled={changeRole.isPending}
                  onClick={() =>
                    changeRole.mutate({
                      userId: member.userId,
                      role: 'speaker',
                    })
                  }
                >
                  Mời lên nói
                </button>
              </li>
            ))}
          </ul>
          {audience.length > listedAudience.length && (
            <p className="text-xs text-slate-500 dark:text-slate-400">
              +{audience.length - listedAudience.length} khán giả khác
            </p>
          )}
        </div>
      ) : (
        <p className="text-center text-sm text-slate-500 dark:text-slate-400">
          {audience.length} khán giả
        </p>
      )}

      {message !== undefined && (
        <p role="alert" className="text-sm text-destructive">
          {message}
        </p>
      )}
    </div>
  );
}
