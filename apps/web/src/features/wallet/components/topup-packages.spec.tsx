import { ApiError } from '@litmatch/api-client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { vi } from 'vitest';

import { TopupPackages } from './topup-packages';
import { apiClient } from '../../../shared/api/client';

import type { PayosPackageDto } from '../api';

function renderPackages() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <TopupPackages />
    </QueryClientProvider>,
  );
}

describe('TopupPackages', () => {
  afterEach(() => vi.restoreAllMocks());

  it('empty — hiện thông báo chưa có gói', async () => {
    vi.spyOn(apiClient, 'GET').mockResolvedValue({
      data: { data: [] },
    } as never);
    renderPackages();

    expect(await screen.findByText(/Chưa có gói nạp nào/)).toBeVisible();
  });

  it('error — hiển thị message', async () => {
    vi.spyOn(apiClient, 'GET').mockRejectedValue(
      new ApiError(500, { code: 'X', message: 'Lỗi server', traceId: 't' }),
    );
    renderPackages();

    expect(await screen.findByRole('alert')).toHaveTextContent('Lỗi server');
  });

  it('data — bấm gói chỉ gửi packageId, giá và Diamond do server quyết định', async () => {
    const packages: PayosPackageDto[] = [
      {
        packageId: 'vn-50000',
        amountVnd: '50000',
        diamonds: '550',
      },
    ];
    vi.spyOn(apiClient, 'GET').mockResolvedValue({
      data: { data: packages },
    } as never);
    const postSpy = vi.spyOn(apiClient, 'POST').mockResolvedValue({
      data: {
        data: {
          orderId: 'ab9c4ccb-264e-4cf0-a4a4-ff77ba9d3491',
          orderCode: '1760000000000000',
          amountVnd: '50000',
          diamonds: '550',
          status: 'pending',
          checkoutUrl: 'https://pay.payos.vn/web/test',
          qrCode: 'qr',
          expiresAt: '2026-07-29T10:00:00.000Z',
          replayed: false,
        },
      },
    } as never);

    renderPackages();
    const button = await screen.findByRole('button', { name: /550 kim cương/ });
    await userEvent.click(button);

    expect(postSpy).toHaveBeenCalledWith(
      '/api/v1/economy/payos/orders',
      expect.objectContaining({
        body: { packageId: 'vn-50000' },
        params: {
          header: { 'Idempotency-Key': expect.any(String) },
        },
      }),
    );
    expect(
      await screen.findByRole('link', { name: /Mở payOS/ }),
    ).toHaveAttribute('href', 'https://pay.payos.vn/web/test');
  });
});
