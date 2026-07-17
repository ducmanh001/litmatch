import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { vi } from 'vitest';

import { apiClient } from '../../../shared/api/client';
import { ConfigPage } from './config-page';

const catalog = {
  iapProducts: [
    {
      productId: 'com.litmatch.diamond.100',
      provider: 'google' as const,
      diamonds: '100',
      active: true,
    },
  ],
  vipPlans: [
    {
      id: 'vip-30d',
      tier: 'vip' as const,
      days: 30,
      priceDiamond: '500',
      active: true,
    },
  ],
};

function renderPage() {
  vi.spyOn(apiClient, 'GET').mockResolvedValue({
    data: { data: catalog },
  } as never);
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <ConfigPage />
    </QueryClientProvider>,
  );
}

describe('ConfigPage', () => {
  afterEach(() => vi.restoreAllMocks());

  it('đọc catalog IAP/VIP thật từ backend, không còn nhãn minh hoạ', async () => {
    renderPage();

    expect(await screen.findByText('com.litmatch.diamond.100')).toBeVisible();
    expect(screen.getByText('VIP · 30 ngày')).toBeVisible();
    expect(screen.queryByText(/Minh hoạ/)).not.toBeInTheDocument();
  });

  it('bật/tắt gói gọi PATCH backend thay vì đổi state cục bộ', async () => {
    const patch = vi.spyOn(apiClient, 'PATCH').mockResolvedValue({
      data: { data: { ...catalog.iapProducts[0], active: false } },
    } as never);
    renderPage();

    await userEvent.click(
      await screen.findByRole('switch', {
        name: 'Bật/tắt com.litmatch.diamond.100',
      }),
    );

    expect(patch).toHaveBeenCalledWith(
      '/api/v1/admin/config/iap-products/{productId}',
      {
        params: { path: { productId: 'com.litmatch.diamond.100' } },
        body: { active: false },
      },
    );
  });

  it('gửi thông báo thiếu nội dung — không gọi API', async () => {
    const post = vi.spyOn(apiClient, 'POST');
    renderPage();
    await screen.findByText('com.litmatch.diamond.100');

    fireEvent.change(screen.getByLabelText('Tiêu đề'), {
      target: { value: 'Ưu đãi' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Gửi thông báo' }));

    expect(post).not.toHaveBeenCalled();
    expect(screen.getByLabelText('Tiêu đề')).toHaveValue('Ưu đãi');
  });

  it('gửi thông báo đủ dữ liệu — gọi API và reset sau success', async () => {
    const post = vi.spyOn(apiClient, 'POST').mockResolvedValue({
      data: { data: { broadcastId: 'b1', recipientCount: 12 } },
    } as never);
    renderPage();
    await screen.findByText('com.litmatch.diamond.100');

    fireEvent.change(screen.getByLabelText('Tiêu đề'), {
      target: { value: 'Ưu đãi cuối tuần' },
    });
    fireEvent.change(screen.getByLabelText('Nội dung'), {
      target: { value: 'Nội dung thông báo' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Gửi thông báo' }));

    await waitFor(() =>
      expect(post).toHaveBeenCalledWith(
        '/api/v1/admin/notifications/broadcast',
        {
          body: {
            title: 'Ưu đãi cuối tuần',
            body: 'Nội dung thông báo',
            audience: 'all',
          },
        },
      ),
    );
    await waitFor(() =>
      expect(screen.getByLabelText('Tiêu đề')).toHaveValue(''),
    );
  });
});
