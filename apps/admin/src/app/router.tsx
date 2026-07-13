import { createBrowserRouter } from 'react-router-dom';

import { RouteError } from './route-error';
import { RequireAuth } from '../shared/auth/require-auth';
import { SessionBootstrap } from '../shared/auth/session-bootstrap';

/**
 * Route tree duy nhất của app. Feature mới = 1 nhánh mới dưới RequireAuth, lazy() theo
 * feature khi màn có bundle riêng đáng kể (docs/13 § 13.13).
 */
export const router = createBrowserRouter([
  {
    element: <SessionBootstrap />,
    errorElement: <RouteError />,
    children: [
      {
        path: '/login',
        lazy: async () => ({
          Component: (await import('../shared/auth/login-page')).LoginPage,
        }),
      },
      {
        element: <RequireAuth />,
        children: [
          {
            lazy: async () => ({
              Component: (await import('./app-shell')).AppShell,
            }),
            children: [
              {
                index: true,
                lazy: async () => ({
                  Component: (
                    await import('../features/dashboard/pages/dashboard-page')
                  ).DashboardPage,
                }),
              },
              {
                path: 'users',
                lazy: async () => ({
                  Component: (
                    await import('../features/users/pages/users-page')
                  ).UsersPage,
                }),
              },
              {
                path: 'moderation',
                lazy: async () => ({
                  Component: (
                    await import('../features/moderation/pages/moderation-page')
                  ).ModerationPage,
                }),
              },
              {
                path: 'gifts',
                lazy: async () => ({
                  Component: (
                    await import('../features/gifts/pages/gifts-page')
                  ).GiftsPage,
                }),
              },
            ],
          },
        ],
      },
    ],
  },
]);
