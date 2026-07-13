import { Navigate, Outlet, useLocation } from 'react-router-dom';

import { useIsAuthenticated } from './use-session';
import { useRole } from './use-role';
import { NotStaffState } from './not-staff-state';

/**
 * Guard route sau login. Ẩn UI KHÔNG phải bảo mật (docs/13 § 13.11) — enforcement thật ở
 * backend `RolesGuard` (docs/12 § 12.7), đây chỉ là UX. Chỉ chặn khi role đọc được RÕ RÀNG
 * là `user` (tài khoản end-user thường) — token không giải mã được (dev/test token giả) KHÔNG
 * bị chặn ở đây, vì đây không phải chốt bảo mật thật.
 */
export function RequireAuth() {
  const isAuthenticated = useIsAuthenticated();
  const role = useRole();
  const location = useLocation();

  if (!isAuthenticated) {
    return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  }
  if (role === 'user') {
    return <NotStaffState />;
  }
  return <Outlet />;
}
