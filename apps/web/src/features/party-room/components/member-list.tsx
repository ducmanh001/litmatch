'use client';

import { isApiError } from '@litmatch/api-client';

import { useChangeRole, useUserProfiles } from '../api';

import type { PartyRoomMemberDto } from '../api';

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
  const audienceCount = members.filter((m) => m.role === 'audience').length;

  const profileIds = [host?.userId, ...speakers.map((s) => s.userId)].filter(
    (id): id is string => id !== undefined,
  );
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

      <p className="text-sm text-muted-foreground">{audienceCount} khán giả</p>

      {message !== undefined && (
        <p role="alert" className="text-sm text-destructive">
          {message}
        </p>
      )}
    </div>
  );
}
