import { ApiError } from '@litmatch/api-client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import { vi } from 'vitest';

import { WalletBalance } from './wallet-balance';
import { apiClient } from '../../../shared/api/client';

import type { WalletDto } from '../api';

function renderBalance() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <WalletBalance />
    </QueryClientProvider>,
  );
}

describe('WalletBalance', () => {
  afterEach(() => vi.restoreAllMocks());

  it('error — hiển thị message từ envelope', async () => {
    vi.spyOn(apiClient, 'GET').mockRejectedValue(
      new ApiError(500, { code: 'X', message: 'Lỗi server', traceId: 't' }),
    );
    renderBalance();

    expect(await screen.findByRole('alert')).toHaveTextContent('Lỗi server');
  });

  it('data — hiển thị số dư', async () => {
    const wallet: WalletDto = {
      balance: '1200',
      earnings: '0',
      vipTier: null,
      vipExpiresAt: null,
    };
    vi.spyOn(apiClient, 'GET').mockResolvedValue({
      data: { data: wallet },
    } as never);
    renderBalance();

    expect(await screen.findByText('1200')).toBeVisible();
  });

  it('data — hiển thị VIP còn hạn', async () => {
    const wallet: WalletDto = {
      balance: '700',
      earnings: '0',
      vipTier: 'vip',
      vipExpiresAt: '2026-08-01T00:00:00.000Z',
    };
    vi.spyOn(apiClient, 'GET').mockResolvedValue({
      data: { data: wallet },
    } as never);
    renderBalance();

    expect(await screen.findByText(/VIP VIP/)).toBeVisible();
  });
});
