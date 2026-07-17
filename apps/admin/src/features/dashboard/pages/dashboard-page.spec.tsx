import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { vi } from 'vitest';

import { DashboardPage } from './dashboard-page';
import { apiClient } from '../../../shared/api/client';

function renderPage() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>
        <DashboardPage />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe('DashboardPage', () => {
  afterEach(() => vi.restoreAllMocks());

  it('hiện toàn bộ dashboard và phòng live bằng dữ liệu thật', async () => {
    vi.spyOn(apiClient, 'GET').mockImplementation(async (path) => {
      if (path === '/api/v1/admin/dashboard') {
        return {
          data: {
            data: {
              newUsersToday: 12,
              newUsersPreviousDay: 10,
              activeUsers: 145,
              activeRoomCount: 1,
              totalDiamondSpentSevenDays: '12345',
              dailyDiamondSpent: [
                { date: '2026-07-14', amount: '2345' },
                { date: '2026-07-15', amount: '10000' },
              ],
              userTiers: { free: 120, vip: 20, svip: 5 },
              recentActivities: [
                {
                  id: 'audit-1',
                  actorUserId: 'admin-1',
                  actorNickname: 'admin',
                  action: 'user.banned',
                  targetType: 'user',
                  targetId: 'user-1',
                  createdAt: '2026-07-15T08:00:00.000Z',
                },
              ],
            },
          },
        } as never;
      }
      return {
        data: {
          data: [
            {
              id: 'rm1',
              hostUserId: 'host-1',
              title: 'Phòng test',
              status: 'active',
              speakerLimit: 8,
              category: 'talk',
              closeReason: null,
              createdAt: new Date().toISOString(),
              hostDisconnectedAt: null,
            },
          ],
          meta: { nextCursor: null },
        },
      } as never;
    });

    renderPage();

    expect(await screen.findByText('Phòng test')).toBeVisible();
    expect(screen.getByText('12.345 Diamond')).toBeVisible();
    expect(screen.getByText(/admin đã khoá tài khoản/)).toBeVisible();
    expect(screen.queryByText(/Minh hoạ/)).not.toBeInTheDocument();
  });
});
