import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { vi } from 'vitest';

import { apiClient } from '../../../shared/api/client';
import { confirmStore } from '../../../shared/lib/confirm-store';
import { VipPlans } from './vip-plans';

function renderPlans() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <VipPlans />
    </QueryClientProvider>,
  );
}

describe('VipPlans', () => {
  afterEach(() => {
    confirmStore.resolve(false);
    vi.restoreAllMocks();
  });

  it('đọc catalog server và chỉ mua sau khi xác nhận với idempotency key', async () => {
    vi.spyOn(apiClient, 'GET').mockImplementation(async (path: string) => {
      if (path === '/api/v1/economy/wallet') {
        return {
          data: {
            data: {
              balance: '1000',
              earnings: '0',
              vipTier: null,
              vipExpiresAt: null,
            },
          },
        } as never;
      }
      return {
        data: {
          data: [
            {
              id: 'vip-30d',
              tier: 'vip',
              days: 30,
              priceDiamond: '500',
            },
          ],
        },
      } as never;
    });
    const post = vi.spyOn(apiClient, 'POST').mockResolvedValue({
      data: {
        data: {
          transactionId: 'txn-1',
          tier: 'vip',
          vipExpiresAt: '2026-08-15T00:00:00.000Z',
          replayed: false,
        },
      },
    } as never);

    renderPlans();
    await userEvent.click(
      await screen.findByRole('button', {
        name: 'Mua VIP 30 ngày với 500 diamond',
      }),
    );

    expect(post).not.toHaveBeenCalled();
    expect(confirmStore.getSnapshot()?.options.message).toContain(
      '500 diamond',
    );
    act(() => confirmStore.resolve(true));

    await waitFor(() =>
      expect(post).toHaveBeenCalledWith(
        '/api/v1/economy/vip/purchase',
        expect.objectContaining({
          body: { planId: 'vip-30d' },
          params: {
            header: { 'Idempotency-Key': expect.any(String) },
          },
        }),
      ),
    );
  });
});
