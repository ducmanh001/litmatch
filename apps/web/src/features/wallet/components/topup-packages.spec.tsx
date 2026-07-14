import { ApiError } from '@litmatch/api-client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { vi } from 'vitest';

import { TopupPackages } from './topup-packages';
import { apiClient } from '../../../shared/api/client';

import type { IapProductDto } from '../api';

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

  it('data — bấm gói gọi verify với productId + provider đúng', async () => {
    const products: IapProductDto[] = [
      {
        productId: 'com.litmatch.diamond.100',
        provider: 'google',
        diamonds: '100',
      },
    ];
    vi.spyOn(apiClient, 'GET').mockResolvedValue({
      data: { data: products },
    } as never);
    const postSpy = vi.spyOn(apiClient, 'POST').mockResolvedValue({
      data: { data: { transactionId: 't1', diamonds: '100', replayed: false } },
    } as never);

    renderPackages();
    const button = await screen.findByRole('button', { name: /100 kim cương/ });
    await userEvent.click(button);

    expect(postSpy).toHaveBeenCalledWith(
      '/api/v1/economy/iap/verify',
      expect.objectContaining({
        body: expect.objectContaining({
          provider: 'google',
          productId: 'com.litmatch.diamond.100',
        }),
      }),
    );
    expect(await screen.findByText(/Nạp thành công/)).toBeVisible();
  });
});
