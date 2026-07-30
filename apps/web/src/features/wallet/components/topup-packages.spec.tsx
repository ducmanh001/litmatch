import { ApiError } from '@litmatch/api-client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { vi } from 'vitest';

import { TopupPackages } from './topup-packages';
import { apiClient } from '../../../shared/api/client';
import { ToastStack } from '../../../shared/ui/toast-stack';

import type { PayosPackageDto } from '../api';
import type { CapabilitiesDto } from '../../../shared/capabilities/api';

function capabilityResponse(status: 'enabled' | 'maintenance' = 'enabled') {
  const enabled = { status: 'enabled' as const, message: 'Sẵn sàng.' };
  return {
    auth: {
      phoneOtp: { ...enabled, clientId: null },
      google: { ...enabled, clientId: 'google' },
      apple: { ...enabled, clientId: 'apple' },
      facebook: { ...enabled, clientId: 'facebook' },
      guest: enabled,
    },
    topUp: {
      web: {
        status,
        message:
          status === 'enabled'
            ? 'Nạp qua payOS.'
            : 'Tính năng đang tạm bảo trì.',
      },
      native: enabled,
      nativeApple: enabled,
      nativeGoogle: enabled,
    },
    video: { upload: enabled, transcode: enabled },
    notifications: { push: enabled },
  } satisfies CapabilitiesDto;
}

function renderPackages() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <TopupPackages />
      <ToastStack />
    </QueryClientProvider>,
  );
}

describe('TopupPackages', () => {
  afterEach(() => vi.restoreAllMocks());

  it('empty — hiện thông báo chưa có gói', async () => {
    vi.spyOn(apiClient, 'GET').mockImplementation(async (path) =>
      path === '/api/v1/capabilities'
        ? ({ data: { data: capabilityResponse() } } as never)
        : ({ data: { data: [] } } as never),
    );
    renderPackages();

    expect(await screen.findByText(/Chưa có gói nạp nào/)).toBeVisible();
  });

  it('error — hiển thị message', async () => {
    vi.spyOn(apiClient, 'GET').mockImplementation(async (path) => {
      if (path === '/api/v1/capabilities') {
        return { data: { data: capabilityResponse() } } as never;
      }
      throw new ApiError(500, {
        code: 'X',
        message: 'Lỗi server',
        traceId: 't',
      });
    });
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
    vi.spyOn(apiClient, 'GET').mockImplementation(async (path) =>
      path === '/api/v1/capabilities'
        ? ({ data: { data: capabilityResponse() } } as never)
        : ({ data: { data: packages } } as never),
    );
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

  it('maintenance — giữ CTA, hiện message endpoint khi bấm và không tải catalog', async () => {
    const get = vi.spyOn(apiClient, 'GET').mockResolvedValue({
      data: { data: capabilityResponse('maintenance') },
    } as never);

    renderPackages();

    const button = await screen.findByRole('button', {
      name: /Nạp Diamond qua web/,
    });
    await userEvent.click(button);

    expect(
      await screen.findByText('Tính năng đang tạm bảo trì.'),
    ).toBeVisible();
    expect(get).toHaveBeenCalledOnce();
    expect(get).toHaveBeenCalledWith('/api/v1/capabilities');
  });

  it('capability endpoint chưa deploy → giữ flow payOS cũ trong rolling deploy', async () => {
    vi.spyOn(apiClient, 'GET').mockImplementation(async (path) => {
      if (path === '/api/v1/capabilities') {
        throw new Error('capability endpoint chưa tồn tại');
      }
      return { data: { data: [] } } as never;
    });

    renderPackages();

    expect(await screen.findByText(/Chưa có gói nạp nào/)).toBeVisible();
  });
});
