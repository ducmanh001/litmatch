import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { vi } from 'vitest';

import HelpPage from './page';
import { apiClient } from '../../../shared/api/client';

function renderPage() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <HelpPage />
    </QueryClientProvider>,
  );
}

describe('HelpPage', () => {
  afterEach(() => vi.restoreAllMocks());

  it('gửi phản hồi qua support API và giữ idempotency header', async () => {
    vi.spyOn(apiClient, 'GET').mockResolvedValue({
      data: { data: { items: [], meta: { nextCursor: null } } },
    } as never);
    const post = vi.spyOn(apiClient, 'POST').mockResolvedValue({
      data: {
        data: {
          id: 'ticket-1',
          userId: 'me',
          category: 'bug',
          message: 'Không mở được phòng',
          status: 'open',
          staffResponse: null,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
      },
    } as never);
    const user = userEvent.setup();
    renderPage();

    await user.type(
      screen.getByPlaceholderText(/Mô tả góp ý/),
      'Không mở được phòng',
    );
    await user.selectOptions(screen.getByLabelText('Loại phản hồi'), 'bug');
    await user.click(screen.getByRole('button', { name: 'Gửi phản hồi' }));

    expect(post).toHaveBeenCalledWith('/api/v1/support/tickets', {
      params: {
        header: { 'Idempotency-Key': expect.any(String) },
      },
      body: { category: 'bug', message: 'Không mở được phòng' },
    });
    expect(await screen.findByText('Đã ghi nhận phản hồi ✓')).toBeVisible();
  });
});
