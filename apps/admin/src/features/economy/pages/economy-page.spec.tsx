import { ApiError } from '@litmatch/api-client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { vi } from 'vitest';

import { EconomyPage } from './economy-page';
import { apiClient } from '../../../shared/api/client';

import type { AdminTransactionDto, AdminWalletDto } from '../api';

function renderPage() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <EconomyPage />
    </QueryClientProvider>,
  );
}

const wallet = (overrides: Partial<AdminWalletDto> = {}): AdminWalletDto => ({
  balance: '1200',
  earnings: '0',
  vipTier: null,
  vipExpiresAt: null,
  ...overrides,
});

const txn = (
  overrides: Partial<AdminTransactionDto> = {},
): AdminTransactionDto => ({
  id: 'txn-1',
  type: 'iap_purchase',
  status: 'completed',
  diamondDelta: '1200',
  createdAt: new Date().toISOString(),
  ...overrides,
});

async function lookupUser(userId = 'u1') {
  fireEvent.change(screen.getByLabelText('User ID'), {
    target: { value: userId },
  });
  await act(async () =>
    fireEvent.click(screen.getByRole('button', { name: 'Xem' })),
  );
}

describe('EconomyPage', () => {
  afterEach(() => vi.restoreAllMocks());

  it('chưa nhập User ID — hiện EmptyState, không gọi API', () => {
    const getSpy = vi.spyOn(apiClient, 'GET');
    renderPage();

    expect(
      screen.getByText('Nhập User ID để xem ví + lịch sử giao dịch'),
    ).toBeVisible();
    expect(getSpy).not.toHaveBeenCalled();
  });

  it('nhập User ID — hiện wallet + transactions', async () => {
    vi.spyOn(apiClient, 'GET').mockImplementation(async (path: string) => {
      if (path === '/api/v1/admin/economy/wallet/{userId}') {
        return { data: { data: wallet() } } as never;
      }
      return {
        data: { data: { items: [txn()], nextCursor: null } },
      } as never;
    });

    renderPage();
    await lookupUser();

    expect(await screen.findByText('1200 💎')).toBeVisible(); // wallet balance
    expect(screen.getByText('1200')).toBeVisible(); // diamondDelta
    expect(screen.getByText('Nạp Diamond (IAP)')).toBeVisible();
  });

  it('error khi tải wallet — hiện message', async () => {
    vi.spyOn(apiClient, 'GET').mockImplementation(async (path: string) => {
      if (path === '/api/v1/admin/economy/wallet/{userId}') {
        throw new ApiError(500, {
          code: 'X',
          message: 'Lỗi server',
          traceId: 't',
        });
      }
      return { data: { data: { items: [], nextCursor: null } } } as never;
    });

    renderPage();
    await lookupUser();

    expect(await screen.findByRole('alert')).toHaveTextContent('Lỗi server');
  });

  it('không có giao dịch — hiện EmptyState riêng cho transactions', async () => {
    vi.spyOn(apiClient, 'GET').mockImplementation(async (path: string) => {
      if (path === '/api/v1/admin/economy/wallet/{userId}') {
        return { data: { data: wallet() } } as never;
      }
      return { data: { data: { items: [], nextCursor: null } } } as never;
    });

    renderPage();
    await lookupUser();

    expect(
      await screen.findByText(
        'User này chưa có giao dịch nào (do user chủ động thực hiện)',
      ),
    ).toBeVisible();
  });

  it('bấm Hoàn tiền với lý do — gọi đúng endpoint refund', async () => {
    vi.spyOn(apiClient, 'GET').mockImplementation(async (path: string) => {
      if (path === '/api/v1/admin/economy/wallet/{userId}') {
        return { data: { data: wallet() } } as never;
      }
      return {
        data: { data: { items: [txn()], nextCursor: null } },
      } as never;
    });
    const postSpy = vi.spyOn(apiClient, 'POST').mockResolvedValue({
      data: {
        data: { transactionId: 'txn-1', reversalTransactionId: 'txn-2' },
      },
    } as never);

    renderPage();
    await lookupUser('u1');

    const reasonInput = await screen.findByPlaceholderText('Lý do hoàn tiền');
    fireEvent.change(reasonInput, { target: { value: 'refund test' } });
    await act(async () =>
      fireEvent.click(screen.getByRole('button', { name: 'Hoàn tiền' })),
    );

    expect(postSpy).toHaveBeenCalledWith(
      '/api/v1/admin/economy/transactions/{id}/refund',
      {
        params: { path: { id: 'txn-1' } },
        body: { reason: 'refund test' },
      },
    );
  });

  it('giao dịch đã reversed — không hiện form hoàn tiền', async () => {
    vi.spyOn(apiClient, 'GET').mockImplementation(async (path: string) => {
      if (path === '/api/v1/admin/economy/wallet/{userId}') {
        return { data: { data: wallet() } } as never;
      }
      return {
        data: {
          data: { items: [txn({ status: 'reversed' })], nextCursor: null },
        },
      } as never;
    });

    renderPage();
    await lookupUser();

    await screen.findByText('Đã hoàn tiền');
    expect(screen.queryByPlaceholderText('Lý do hoàn tiền')).toBeNull();
  });
});
