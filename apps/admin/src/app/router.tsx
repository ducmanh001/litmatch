import { createBrowserRouter } from 'react-router-dom';

import { AppShell } from './app-shell';
import { RouteError } from './route-error';
import { LoginPage } from '../shared/auth/login-page';
import { RequireAuth } from '../shared/auth/require-auth';
import { DashboardPage } from '../features/dashboard/pages/dashboard-page';

/**
 * Route tree duy nhất của app. Feature mới = 1 nhánh mới dưới RequireAuth, lazy() theo
 * feature khi màn có bundle riêng đáng kể (docs/13 § 13.13).
 */
export const router = createBrowserRouter([
  { path: '/login', element: <LoginPage />, errorElement: <RouteError /> },
  {
    element: <RequireAuth />,
    errorElement: <RouteError />,
    children: [
      {
        element: <AppShell />,
        children: [{ index: true, element: <DashboardPage /> }],
      },
    ],
  },
]);
