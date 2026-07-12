import { Navigate, Outlet, useLocation } from 'react-router-dom';

import { useIsAuthenticated } from './use-session';

/**
 * Guard route sau login. Ẩn UI KHÔNG phải bảo mật (docs/13 § 13.11) — enforcement thật ở
 * backend guard; đây chỉ là UX. Khi backend có role admin (docs/12 § 12.7 Task 0), guard
 * role sẽ đọc từ AccessTokenPayload tại đây.
 */
export function RequireAuth() {
  const isAuthenticated = useIsAuthenticated();
  const location = useLocation();

  if (!isAuthenticated) {
    return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  }
  return <Outlet />;
}
