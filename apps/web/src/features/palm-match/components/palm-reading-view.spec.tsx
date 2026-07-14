import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { vi } from 'vitest';

import { PalmReadingView } from './palm-reading-view';
import { apiClient } from '../../../shared/api/client';

function renderView() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <PalmReadingView />
    </QueryClientProvider>,
  );
}

describe('PalmReadingView', () => {
  afterEach(() => vi.restoreAllMocks());

  it('chưa chọn category — hiện 4 lựa chọn, chưa gọi API', () => {
    const get = vi.spyOn(apiClient, 'GET');
    renderView();

    expect(
      screen.getByRole('button', { name: /Tình yêu/ }),
    ).toBeInTheDocument();
    expect(get).not.toHaveBeenCalled();
  });

  it('chọn category — gọi đúng API kèm category, hiện nội dung thật', async () => {
    const get = vi.spyOn(apiClient, 'GET').mockResolvedValue({
      data: {
        data: {
          category: 'love',
          content: 'Hôm nay là ngày tốt để làm quen ai đó mới.',
          forDate: '2026-07-14',
        },
      },
    } as never);

    renderView();
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: /Tình yêu/ }));

    expect(get).toHaveBeenCalledWith(
      '/api/v1/palm-match/reading',
      expect.objectContaining({
        params: { query: { category: 'love', targetName: undefined } },
      }),
    );
    expect(await screen.findByText(/Hôm nay là ngày tốt/)).toBeVisible();
  });

  it('bấm "Xem chủ đề khác" — quay lại màn chọn category', async () => {
    vi.spyOn(apiClient, 'GET').mockResolvedValue({
      data: {
        data: { category: 'love', content: 'Nội dung.', forDate: '2026-07-14' },
      },
    } as never);

    renderView();
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: /Tình yêu/ }));
    await user.click(
      await screen.findByRole('button', { name: 'Xem chủ đề khác' }),
    );

    expect(
      screen.getByRole('button', { name: /Sự nghiệp/ }),
    ).toBeInTheDocument();
  });
});
