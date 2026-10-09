import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import { vi } from 'vitest';

import { apiClient, tokenStore } from '../../../shared/api/client';
import { ProfileStats } from './profile-stats';

function ok(data: unknown) {
  return Promise.resolve({ data: { data } }) as never;
}

function renderStats() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <ProfileStats />
    </QueryClientProvider>,
  );
}

describe('ProfileStats', () => {
  beforeEach(() => {
    tokenStore.setSession({ accessToken: 'a', csrfToken: 'r' });
  });

  afterEach(() => {
    tokenStore.setSession(null);
    vi.restoreAllMocks();
  });

  it('hiển thị số thật và link tới từng danh sách; "Bạn bè" đếm cả ghép đôi lẫn follow chéo', async () => {
    vi.spyOn(apiClient, 'GET').mockImplementation(((path: string) => {
      if (path === '/api/v1/users/me') return ok({ id: 'u-me' });
      if (path === '/api/v1/economy/wallet') return ok({ balance: 120 });
      if (path === '/api/v1/profiles/{profileUserId}/follow-counts') {
        return ok({ followerCount: 1234, followingCount: 56 });
      }
      if (path === '/api/v1/friends/connections') {
        return ok([{ isFriend: true }, { isMutualFollow: true }]);
      }
      return ok(undefined);
    }) as never);
    renderStats();

    expect(
      await screen.findByRole('link', { name: /2\s*Bạn bè/ }),
    ).toHaveAttribute('href', '/friends');
    expect(
      await screen.findByRole('link', { name: /1\.234\s*Người theo dõi/ }),
    ).toHaveAttribute('href', '/users/u-me/followers');
    expect(
      screen.getByRole('link', { name: /56\s*Đang theo dõi/ }),
    ).toHaveAttribute('href', '/users/u-me/following');
    expect(screen.getByRole('link', { name: /120\s*Diamond/ })).toHaveAttribute(
      'href',
      '/wallet',
    );
  });
});
