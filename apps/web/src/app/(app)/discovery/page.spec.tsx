import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { vi } from 'vitest';

import DiscoveryPage from './page';
import { apiClient } from '../../../shared/api/client';

import type { DiscoveryCardDto } from '../../../features/discovery/api';

function cardFixture(
  overrides: Partial<DiscoveryCardDto> = {},
): DiscoveryCardDto {
  return {
    profile: {
      id: 'user-1',
      nickname: 'Chi',
      gender: 'female',
      avatarId: 'default',
    },
    ageBucket: '20-24',
    ...overrides,
  };
}

function renderPage() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <DiscoveryPage />
    </QueryClientProvider>,
  );
}

describe('DiscoveryPage', () => {
  afterEach(() => vi.restoreAllMocks());

  it('rỗng — gợi ý chưa có ai phù hợp', async () => {
    vi.spyOn(apiClient, 'GET').mockResolvedValue({
      data: { data: { items: [], nextCursor: null } },
    } as never);
    renderPage();

    expect(await screen.findByText(/Chưa có ai phù hợp lúc này/)).toBeVisible();
  });

  it('có card — bấm vào mở sheet, mời Voice Match gọi đúng API', async () => {
    const card = cardFixture();
    vi.spyOn(apiClient, 'GET').mockResolvedValue({
      data: { data: { items: [card], nextCursor: null } },
    } as never);
    const post = vi.spyOn(apiClient, 'POST').mockResolvedValue({
      data: {
        data: {
          id: 'invite-1',
          inviterUserId: 'me',
          inviteeUserId: 'user-1',
          matchType: 'voice',
          status: 'pending',
          expiresAt: new Date().toISOString(),
          sessionId: null,
          createdAt: new Date().toISOString(),
        },
      },
    } as never);

    renderPage();
    const user = userEvent.setup();
    await user.click(await screen.findByText('Chi'));
    await user.click(screen.getByRole('button', { name: 'Mời Voice Match' }));

    expect(post).toHaveBeenCalledWith(
      '/api/v1/matching/invites',
      expect.objectContaining({
        body: { inviteeUserId: 'user-1', matchType: 'voice' },
      }),
    );
    expect(await screen.findByText(/Đã gửi lời mời Voice Match/)).toBeVisible();
  });
});
