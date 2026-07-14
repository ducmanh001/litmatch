'use client';

import { isApiError } from '@litmatch/api-client';

import { useChangeRole, useUserProfiles } from '../api';

import type { PartyRoomMemberDto } from '../api';

/** Chặn fan-out profile query không giới hạn — audience không có cap ở backend như speaker. */
const MAX_AUDIENCE_LISTED = 20;

export function MemberList({
  roomId,
  members,
  isHost,
}: {
  roomId: string;
  members: PartyRoomMemberDto[];
  isHost: boolean;
}) {
  const host = members.find((m) => m.role === 'host');
  const speakers = members.filter((m) => m.role === 'speaker');
  const audience = members.filter((m) => m.role === 'audience');
  // Chỉ host mới cần thấy từng khán giả (để mời lên nói) — non-host chỉ thấy số lượng.
  const listedAudience = isHost ? audience.slice(0, MAX_AUDIENCE_LISTED) : [];

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
    <div className="space-y-3">
      {host !== undefined && (
        <div>
          <p className="text-xs font-medium text-muted-foreground">Host</p>
          <p className="text-sm">{nicknameById.get(host.userId) ?? '…'}</p>
        </div>
      )}

      {speakers.length > 0 && (
        <div className="space-y-1">
          <p className="text-xs font-medium text-muted-foreground">
            Đang nói ({speakers.length})
          </p>
          <ul className="space-y-1">
            {speakers.map((speaker) => (
              <li
                key={speaker.userId}
                className="flex items-center justify-between text-sm"
              >
                <span>{nicknameById.get(speaker.userId) ?? '…'}</span>
                {isHost && (
                  <button
                    type="button"
                    className="text-xs text-muted-foreground underline disabled:opacity-50"
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
              </li>
            ))}
          </ul>
        </div>
      )}

      {isHost && audience.length > 0 ? (
        <div className="space-y-1">
          <p className="text-xs font-medium text-muted-foreground">
            Khán giả ({audience.length})
          </p>
          <ul className="space-y-1">
            {listedAudience.map((member) => (
              <li
                key={member.userId}
                className="flex items-center justify-between text-sm"
              >
                <span>{nicknameById.get(member.userId) ?? '…'}</span>
                <button
                  type="button"
                  className="text-xs text-muted-foreground underline disabled:opacity-50"
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
            <p className="text-xs text-muted-foreground">
              +{audience.length - listedAudience.length} khán giả khác
            </p>
          )}
        </div>
      ) : (
        <p className="text-sm text-muted-foreground">
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
