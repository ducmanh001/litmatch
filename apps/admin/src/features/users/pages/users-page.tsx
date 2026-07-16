import { isApiError } from '@litmatch/api-client';
import { useState } from 'react';

import { useCurrentUserId } from '../../../shared/auth/use-current-user-id';
import { Button } from '../../../shared/ui/button';
import { Card } from '../../../shared/ui/card';
import { Field } from '../../../shared/ui/field';
import { Input } from '../../../shared/ui/input';
import { Modal, ModalBody, ModalHeader } from '../../../shared/ui/modal';
import { Pill } from '../../../shared/ui/pill';
import {
  EmptyState,
  ErrorState,
  LoadingState,
} from '../../../shared/ui/states';
import { showToast } from '../../../shared/lib/toast-store';
import { useBanUser, useUnbanUser, useUsersList } from '../api';

import type { ReactNode } from 'react';
import type { PillVariant } from '../../../shared/ui/pill';
import type { AdminUserDto } from '../api';

const PAGE_SIZE = 20;

const ROLE_PILL: Record<AdminUserDto['role'], PillVariant> = {
  user: 'neutral',
  moderator: 'accent',
  admin: 'gold',
};

const AVATAR_COLORS = [
  '#e0538a',
  '#5b7fe8',
  '#22b88a',
  '#d9971f',
  '#8b6fe0',
  '#c2554a',
];

function avatarColor(userId: string): string {
  let hash = 0;
  for (let i = 0; i < userId.length; i++)
    hash = (hash * 31 + userId.charCodeAt(i)) >>> 0;
  return AVATAR_COLORS[hash % AVATAR_COLORS.length];
}

function initialsOf(nickname: string): string {
  return nickname.slice(0, 2).toUpperCase();
}

export function UsersPage() {
  const currentUserId = useCurrentUserId();
  const [nickname, setNickname] = useState('');
  const [status, setStatus] = useState<AdminUserDto['status'] | ''>('');
  const [offset, setOffset] = useState(0);
  const [profileUser, setProfileUser] = useState<AdminUserDto | null>(null);

  const filter = {
    nickname,
    status: status === '' ? undefined : status,
  };
  const { data, isPending, error } = useUsersList(filter, offset);
  const banUser = useBanUser();
  const unbanUser = useUnbanUser();

  const actionError = (err: unknown): string | null => {
    if (err === null || err === undefined) return null;
    return isApiError(err) ? err.message : 'Có lỗi xảy ra, thử lại.';
  };

  function ban(user: AdminUserDto): void {
    banUser.mutate(user.id, {
      onSuccess: () => showToast(`Đã khoá tài khoản @${user.nickname}`, 'warn'),
    });
  }

  function unban(user: AdminUserDto): void {
    unbanUser.mutate(user.id, {
      onSuccess: () => showToast(`Đã mở khoá tài khoản @${user.nickname}`),
    });
  }

  return (
    <section className="space-y-4">
      <Card className="flex flex-wrap items-end gap-4">
        <Field htmlFor="nickname-filter" label="Nickname">
          <Input
            id="nickname-filter"
            value={nickname}
            onChange={(e) => {
              setNickname(e.target.value);
              setOffset(0);
            }}
            placeholder="Tìm theo nickname"
            className="min-w-[200px]"
          />
        </Field>
        <Field htmlFor="status-filter" label="Trạng thái">
          <select
            id="status-filter"
            className="h-9 rounded-[9px] border border-border bg-muted px-3 text-[13px] text-foreground focus-visible:outline-2 focus-visible:outline-ring"
            value={status}
            onChange={(e) => {
              setStatus(e.target.value as AdminUserDto['status'] | '');
              setOffset(0);
            }}
          >
            <option value="">Tất cả</option>
            <option value="active">Active</option>
            <option value="banned">Banned</option>
          </select>
        </Field>
      </Card>

      {isPending && <LoadingState />}
      {error !== null && <ErrorState error={error} />}
      {data !== undefined && data.items.length === 0 && (
        <EmptyState title="Không có user nào khớp bộ lọc" />
      )}

      {data !== undefined && data.items.length > 0 && (
        <Card className="overflow-hidden p-0">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] border-collapse text-[13px]">
              <thead className="border-b border-border">
                <tr>
                  <th className="px-[18px] py-3 text-left text-[11px] font-bold tracking-wide text-muted-foreground uppercase">
                    Nickname
                  </th>
                  <th className="px-[18px] py-3 text-left text-[11px] font-bold tracking-wide text-muted-foreground uppercase">
                    Role
                  </th>
                  <th className="px-[18px] py-3 text-left text-[11px] font-bold tracking-wide text-muted-foreground uppercase">
                    Trạng thái
                  </th>
                  <th className="px-[18px] py-3 text-left text-[11px] font-bold tracking-wide text-muted-foreground uppercase">
                    Guest
                  </th>
                  <th className="px-[18px] py-3" />
                </tr>
              </thead>
              <tbody>
                {data.items.map((user) => (
                  <tr
                    key={user.id}
                    className="border-b border-border last:border-0 hover:bg-muted"
                  >
                    <td className="px-[18px] py-[13px]">
                      <button
                        type="button"
                        onClick={() => setProfileUser(user)}
                        className="flex items-center gap-2.5 text-left"
                      >
                        <span
                          className="flex size-[30px] shrink-0 items-center justify-center rounded-[9px] text-[11px] font-extrabold text-white"
                          style={{ background: avatarColor(user.id) }}
                        >
                          {initialsOf(user.nickname)}
                        </span>
                        <span className="font-bold hover:text-primary hover:underline">
                          {user.nickname}
                        </span>
                      </button>
                    </td>
                    <td className="px-[18px] py-[13px]">
                      <Pill variant={ROLE_PILL[user.role]}>{user.role}</Pill>
                    </td>
                    <td className="px-[18px] py-[13px]">
                      <Pill
                        variant={user.status === 'active' ? 'green' : 'red'}
                      >
                        {user.status === 'active' ? 'Active' : 'Banned'}
                      </Pill>
                    </td>
                    <td className="px-[18px] py-[13px]">
                      {user.isGuest ? 'Có' : 'Không'}
                    </td>
                    <td className="px-[18px] py-[13px] text-right">
                      {user.status === 'banned' ? (
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={unbanUser.isPending}
                          onClick={() => unban(user)}
                        >
                          Mở khoá
                        </Button>
                      ) : (
                        <Button
                          size="sm"
                          variant="destructive"
                          disabled={
                            banUser.isPending || user.id === currentUserId
                          }
                          title={
                            user.id === currentUserId
                              ? 'Không thể tự khoá tài khoản của chính mình'
                              : undefined
                          }
                          onClick={() => ban(user)}
                        >
                          Khoá
                        </Button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {data.total > PAGE_SIZE && (
            <div className="flex items-center justify-between px-5 pt-4 pb-1 text-[12.5px] text-muted-foreground">
              <Button
                variant="outline"
                disabled={offset === 0}
                onClick={() => setOffset(Math.max(0, offset - PAGE_SIZE))}
              >
                Trang trước
              </Button>
              <span>
                {offset + 1}–{Math.min(offset + PAGE_SIZE, data.total)} /{' '}
                {data.total}
              </span>
              <Button
                variant="outline"
                disabled={offset + PAGE_SIZE >= data.total}
                onClick={() => setOffset(offset + PAGE_SIZE)}
              >
                Trang sau
              </Button>
            </div>
          )}
        </Card>
      )}

      {(actionError(banUser.error) ?? actionError(unbanUser.error)) !==
        null && (
        <p role="alert" className="text-sm text-destructive">
          {actionError(banUser.error) ?? actionError(unbanUser.error)}
        </p>
      )}

      <Modal open={profileUser !== null} onClose={() => setProfileUser(null)}>
        {profileUser !== null && (
          <>
            <ModalHeader
              title="Hồ sơ người dùng"
              onClose={() => setProfileUser(null)}
            />
            <ModalBody>
              <div className="mb-[18px] flex items-center gap-3.5">
                <div
                  className="flex size-14 items-center justify-center rounded-2xl text-lg font-extrabold text-white"
                  style={{ background: avatarColor(profileUser.id) }}
                >
                  {initialsOf(profileUser.nickname)}
                </div>
                <div>
                  <div className="text-base font-extrabold">
                    {profileUser.nickname}
                  </div>
                  <div className="mt-0.5 font-mono text-xs text-muted-foreground">
                    ID: {profileUser.id}
                  </div>
                </div>
              </div>
              <div className="mb-[18px] grid grid-cols-2 gap-3.5">
                <ProfileField label="Role">
                  <Pill variant={ROLE_PILL[profileUser.role]}>
                    {profileUser.role}
                  </Pill>
                </ProfileField>
                <ProfileField label="Trạng thái">
                  <Pill
                    variant={profileUser.status === 'active' ? 'green' : 'red'}
                  >
                    {profileUser.status === 'active' ? 'Active' : 'Banned'}
                  </Pill>
                </ProfileField>
                <ProfileField label="Giới tính">
                  {profileUser.gender ?? '—'}
                </ProfileField>
                <ProfileField label="Guest">
                  {profileUser.isGuest ? 'Có' : 'Không'}
                </ProfileField>
              </div>
              <div className="flex gap-2.5 border-t border-border pt-3.5">
                {profileUser.status === 'active' ? (
                  <Button
                    variant="destructive"
                    disabled={
                      banUser.isPending || profileUser.id === currentUserId
                    }
                    onClick={() => {
                      ban(profileUser);
                      setProfileUser(null);
                    }}
                  >
                    Khoá tài khoản
                  </Button>
                ) : (
                  <Button
                    variant="outline"
                    disabled={unbanUser.isPending}
                    onClick={() => {
                      unban(profileUser);
                      setProfileUser(null);
                    }}
                  >
                    Mở khoá tài khoản
                  </Button>
                )}
              </div>
            </ModalBody>
          </>
        )}
      </Modal>
    </section>
  );
}

function ProfileField({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  return (
    <div>
      <div className="mb-1 text-[11px] font-bold tracking-wide text-muted-foreground uppercase">
        {label}
      </div>
      <div className="text-[13.5px] font-bold">{children}</div>
    </div>
  );
}
