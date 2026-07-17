import { showToast } from '../../../shared/lib/toast-store';
import { useCurrentUserId } from '../../../shared/auth/use-current-user-id';
import { Button } from '../../../shared/ui/button';
import { Card } from '../../../shared/ui/card';
import {
  EmptyState,
  ErrorState,
  LoadingState,
} from '../../../shared/ui/states';
import {
  usePermissionMatrix,
  useSetRolePermission,
  useSetStaffRole,
  useStaff,
} from '../api';

import type { AdminRolePermissionDto, AdminStaffDto } from '../api';
import type { ReactNode } from 'react';

export function PermissionsPage() {
  const currentUserId = useCurrentUserId();
  const matrix = usePermissionMatrix();
  const staff = useStaff();
  const setPermission = useSetRolePermission();
  const setStaffRole = useSetStaffRole();
  const permissions = matrix.data?.permissions ?? [];
  const staffItems = staff.data ?? [];

  const togglePermission = (
    role: 'moderator' | 'admin',
    permission: AdminRolePermissionDto,
  ): void => {
    const enabled = !permission[role];
    setPermission.mutate(
      { role, permission: permission.permission, enabled },
      {
        onSuccess: () =>
          showToast(
            `Đã ${enabled ? 'bật' : 'tắt'} quyền "${permission.label}" cho ${role}`,
          ),
      },
    );
  };

  const changeStaffRole = (
    staffMember: AdminStaffDto,
    role: 'user' | 'moderator' | 'admin',
  ): void => {
    setStaffRole.mutate(
      { id: staffMember.id, role },
      {
        onSuccess: () =>
          showToast(
            role === 'user'
              ? `Đã thu hồi quyền quản trị của ${staffMember.nickname}`
              : `Đã đổi vai trò của ${staffMember.nickname} thành ${role}`,
            role === 'user' ? 'warn' : undefined,
          ),
      },
    );
  };

  return (
    <section className="space-y-4">
      <Card>
        <div className="mb-1 flex items-center gap-2.5">
          <h3 className="text-[14.5px] font-extrabold">
            Ma trận quyền theo vai trò
          </h3>
        </div>
        <p className="pb-3.5 text-[11.5px] text-muted-foreground">
          Mỗi ô là policy backend đang enforce thật. Quyền “Phân quyền admin”
          của role admin luôn bật để không tự khóa control plane.
        </p>
        {matrix.isPending && <LoadingState label="Đang tải policy…" />}
        {matrix.error !== null && <ErrorState error={matrix.error} />}
        {setPermission.error !== null && (
          <ErrorState error={setPermission.error} />
        )}
        {matrix.data !== undefined && (
          <table className="w-full border-collapse text-[13px]">
            <thead>
              <tr>
                <HeaderCell align="left">Quyền</HeaderCell>
                <HeaderCell>Moderator</HeaderCell>
                <HeaderCell>Admin</HeaderCell>
              </tr>
            </thead>
            <tbody>
              {permissions.map((permission) => (
                <tr key={permission.permission}>
                  <td className="border-b border-border px-4 py-3">
                    {permission.label}
                  </td>
                  {(['moderator', 'admin'] as const).map((role) => {
                    const protectedControl =
                      role === 'admin' &&
                      permission.permission === 'manage_permissions';
                    return (
                      <td
                        key={role}
                        className="border-b border-border px-4 py-3 text-center"
                      >
                        <input
                          type="checkbox"
                          className="size-[18px] accent-primary disabled:opacity-50"
                          checked={permission[role]}
                          disabled={protectedControl || setPermission.isPending}
                          onChange={() => togglePermission(role, permission)}
                          aria-label={`${permission.label} — ${role}`}
                        />
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>

      <Card className="overflow-hidden p-0">
        <div className="px-[18px] pt-[18px]">
          <h3 className="text-[14.5px] font-extrabold">
            Danh sách quản trị viên
          </h3>
        </div>
        {staff.isPending && <LoadingState label="Đang tải staff…" />}
        {staff.error !== null && <ErrorState error={staff.error} />}
        {setStaffRole.error !== null && (
          <ErrorState error={setStaffRole.error} />
        )}
        {staff.data !== undefined && staffItems.length === 0 && (
          <EmptyState title="Chưa có staff" />
        )}
        {staffItems.length > 0 && (
          <div className="overflow-x-auto">
            <table className="mt-3.5 w-full min-w-[420px] border-collapse text-[13px]">
              <thead className="border-b border-border">
                <tr>
                  <HeaderCell align="left">Nickname</HeaderCell>
                  <HeaderCell align="left">Role</HeaderCell>
                  <th className="px-[18px] py-3" />
                </tr>
              </thead>
              <tbody>
                {staffItems.map((staffMember) => {
                  const isSelf = staffMember.id === currentUserId;
                  return (
                    <tr
                      key={staffMember.id}
                      className="border-b border-border last:border-0 hover:bg-muted"
                    >
                      <td className="px-[18px] py-[13px]">
                        {staffMember.nickname}
                        {isSelf ? ' (bạn)' : ''}
                      </td>
                      <td className="px-[18px] py-[13px]">
                        <select
                          value={staffMember.role}
                          disabled={isSelf || setStaffRole.isPending}
                          onChange={(event) =>
                            changeStaffRole(
                              staffMember,
                              event.target.value as 'moderator' | 'admin',
                            )
                          }
                          aria-label={`Vai trò của ${staffMember.nickname}`}
                          className="h-8 rounded-lg border border-border bg-muted px-2.5 text-[12.5px] focus-visible:outline-2 focus-visible:outline-ring disabled:opacity-50"
                        >
                          <option value="moderator">moderator</option>
                          <option value="admin">admin</option>
                        </select>
                      </td>
                      <td className="px-[18px] py-[13px] text-right">
                        <Button
                          size="sm"
                          variant="destructive"
                          disabled={isSelf || setStaffRole.isPending}
                          onClick={() => changeStaffRole(staffMember, 'user')}
                        >
                          Thu hồi quyền
                        </Button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </section>
  );
}

function HeaderCell({
  children,
  align = 'center',
}: {
  children: ReactNode;
  align?: 'left' | 'center';
}) {
  return (
    <th
      className={`border-b border-border px-4 py-3 text-[11px] font-bold tracking-wide text-muted-foreground uppercase ${
        align === 'left' ? 'text-left' : 'text-center'
      }`}
    >
      {children}
    </th>
  );
}
