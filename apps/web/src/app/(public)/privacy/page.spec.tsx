import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { vi } from 'vitest';

import PrivacyPage from './page';
import { apiClient, tokenStore } from '../../../shared/api/client';

function renderPage() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <PrivacyPage />
    </QueryClientProvider>,
  );
}

describe('PrivacyPage', () => {
  afterEach(() => {
    tokenStore.setSession(null);
    vi.restoreAllMocks();
  });

  it('đọc settings server và PUT toàn bộ state khi người dùng bật/tắt', async () => {
    tokenStore.setSession({ accessToken: 'a', csrfToken: 'r' });
    const settings = {
      showOnlineStatus: true,
      showDistance: true,
      searchableByPhone: false,
      hideProfile: false,
    };
    vi.spyOn(apiClient, 'GET').mockResolvedValue({
      data: { data: settings },
    } as never);
    const put = vi.spyOn(apiClient, 'PUT').mockResolvedValue({
      data: { data: { ...settings, showDistance: false } },
    } as never);

    renderPage();
    const user = userEvent.setup();
    const distance = await screen.findByRole('switch', {
      name: 'Hiện khoảng cách',
    });
    expect(distance).toHaveAttribute('aria-checked', 'true');

    await user.click(distance);

    expect(put).toHaveBeenCalledWith('/api/v1/users/me/privacy', {
      body: { ...settings, showDistance: false },
    });
  });

  it('chưa đăng nhập → toggle bị khoá, không ghi privacy client-side', async () => {
    renderPage();

    const distance = await screen.findByRole('switch', {
      name: 'Hiện khoảng cách',
    });
    expect(distance).toBeDisabled();
  });
});
