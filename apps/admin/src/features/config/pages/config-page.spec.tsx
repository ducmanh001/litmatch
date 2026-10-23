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
      data: { data: { broadcastId: 'b1', status: 'queued' } },
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
          params: { header: { 'Idempotency-Key': expect.any(String) } },
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
  it('gửi lại cùng nội dung sau lỗi dùng LẠI cùng Idempotency-Key; đổi nội dung thì khoá mới', async () => {
    const post = vi
      .spyOn(apiClient, 'POST')
      .mockRejectedValueOnce(new Error('mất mạng'))
      .mockRejectedValueOnce(new Error('mất mạng'))
      .mockResolvedValue({
        data: { data: { broadcastId: 'b1', status: 'queued' } },
      } as never);
    renderPage();
    await screen.findByText('com.litmatch.diamond.100');
    fireEvent.change(screen.getByLabelText('Tiêu đề'), {
      target: { value: 'Ưu đãi' },
    });
    fireEvent.change(screen.getByLabelText('Nội dung'), {
      target: { value: 'Nội dung A' },
    });
    const send = () =>
      fireEvent.click(screen.getByRole('button', { name: 'Gửi thông báo' }));
    const keyOf = (call: number): string =>
      (
        post.mock.calls[call]?.[1] as {
          params: { header: Record<string, string> };
        }
      ).params.header['Idempotency-Key'];

    send();
    await waitFor(() => expect(post).toHaveBeenCalledTimes(1));
    await waitFor(() =>
      expect(
        screen.getByRole('button', { name: 'Gửi thông báo' }),
      ).toBeEnabled(),
    );
    send(); // cùng nội dung: server có thể đã nhận lần trước → phải cùng khoá để không tạo bản thứ hai
    await waitFor(() => expect(post).toHaveBeenCalledTimes(2));
    expect(keyOf(1)).toBe(keyOf(0));

    await waitFor(() =>
      expect(
        screen.getByRole('button', { name: 'Gửi thông báo' }),
      ).toBeEnabled(),
    );
    fireEvent.change(screen.getByLabelText('Nội dung'), {
      target: { value: 'Nội dung B' },
    });
    send();
    await waitFor(() => expect(post).toHaveBeenCalledTimes(3));
    expect(keyOf(2)).not.toBe(keyOf(0));
  });
});
