import { isApiError } from '@litmatch/api-client';
import { useState } from 'react';

import { useCurrentUserId } from '../../../shared/auth/use-current-user-id';
import { Button } from '../../../shared/ui/button';
import { Card } from '../../../shared/ui/card';
import { Field } from '../../../shared/ui/field';
import { Input } from '../../../shared/ui/input';
import {
  EmptyState,
  ErrorState,
  LoadingState,
} from '../../../shared/ui/states';
import { useBanUser, useUnbanUser, useUsersList } from '../api';

import type { AdminUserDto } from '../api';

const PAGE_SIZE = 20;

export function UsersPage() {
  const currentUserId = useCurrentUserId();
  const [nickname, setNickname] = useState('');
  const [status, setStatus] = useState<AdminUserDto['status'] | ''>('');
  const [offset, setOffset] = useState(0);

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

  return (
    <section className="space-y-4">
      <h1 className="text-2xl font-semibold">Người dùng</h1>

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
          />
        </Field>
        <Field htmlFor="status-filter" label="Trạng thái">
          <select
            id="status-filter"
            className="h-9 rounded-md border border-border bg-card px-3 text-sm"
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
        <Card className="overflow-x-auto p-0">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-border text-muted-foreground">
              <tr>
                <th className="px-4 py-2 font-medium">Nickname</th>
                <th className="px-4 py-2 font-medium">Role</th>
                <th className="px-4 py-2 font-medium">Trạng thái</th>
                <th className="px-4 py-2 font-medium">Guest</th>
                <th className="px-4 py-2 font-medium" />
              </tr>
            </thead>
            <tbody>
              {data.items.map((user) => (
                <tr
                  key={user.id}
                  className="border-b border-border last:border-0"
                >
                  <td className="px-4 py-2">{user.nickname}</td>
                  <td className="px-4 py-2">{user.role}</td>
                  <td className="px-4 py-2">{user.status}</td>
                  <td className="px-4 py-2">{user.isGuest ? 'Có' : 'Không'}</td>
                  <td className="px-4 py-2 text-right">
                    {user.status === 'banned' ? (
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={unbanUser.isPending}
                        onClick={() => unbanUser.mutate(user.id)}
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
                        onClick={() => banUser.mutate(user.id)}
                      >
                        Khoá
                      </Button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}

      {(actionError(banUser.error) ?? actionError(unbanUser.error)) !==
        null && (
        <p role="alert" className="text-sm text-destructive">
          {actionError(banUser.error) ?? actionError(unbanUser.error)}
        </p>
      )}

      {data !== undefined && data.total > PAGE_SIZE && (
        <div className="flex items-center justify-between">
          <Button
            variant="ghost"
            disabled={offset === 0}
            onClick={() => setOffset(Math.max(0, offset - PAGE_SIZE))}
          >
            Trang trước
          </Button>
          <span className="text-sm text-muted-foreground">
            {offset + 1}–{Math.min(offset + PAGE_SIZE, data.total)} /{' '}
            {data.total}
          </span>
          <Button
            variant="ghost"
            disabled={offset + PAGE_SIZE >= data.total}
            onClick={() => setOffset(offset + PAGE_SIZE)}
          >
            Trang sau
          </Button>
        </div>
      )}
    </section>
  );
}
