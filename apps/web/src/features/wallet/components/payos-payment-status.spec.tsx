import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import { vi } from 'vitest';

import { PayosPaymentStatus } from './payos-payment-status';
import { apiClient } from '../../../shared/api/client';

const searchParams = new URLSearchParams();

vi.mock('next/navigation', () => ({
  useSearchParams: () => searchParams,
}));

function renderStatus() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return {
    ...render(
      <QueryClientProvider client={queryClient}>
        <PayosPaymentStatus />
      </QueryClientProvider>,
    ),
    queryClient,
  };
}

describe('PayosPaymentStatus', () => {
  afterEach(() => {
    searchParams.delete('paymentOrder');
    vi.restoreAllMocks();
  });

  it('không gọi API khi không quay về từ checkout', () => {
    const getSpy = vi.spyOn(apiClient, 'GET');
    const { container } = renderStatus();
    expect(container).toBeEmptyDOMElement();
    expect(getSpy).not.toHaveBeenCalled();
  });

  it('chỉ tin trạng thái paid từ API và hiển thị số Diamond server trả', async () => {
    searchParams.set('paymentOrder', 'ab9c4ccb-264e-4cf0-a4a4-ff77ba9d3491');
    vi.spyOn(apiClient, 'GET').mockResolvedValue({
      data: {
        data: {
          orderId: 'ab9c4ccb-264e-4cf0-a4a4-ff77ba9d3491',
          status: 'paid',
          transactionId: '1dc782aa-5c6d-447a-aef7-9f0baae588cc',
          diamonds: '550',
        },
      },
    } as never);

    const { queryClient } = renderStatus();
    const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries');

    expect(await screen.findByText(/đã cộng 550 Diamond/i)).toBeVisible();
    await waitFor(() =>
      expect(invalidateSpy).toHaveBeenCalledWith({
        queryKey: ['wallet', 'me'],
      }),
    );
    expect(apiClient.GET).toHaveBeenCalledWith(
      '/api/v1/economy/payos/orders/{orderId}',
      {
        params: {
          path: {
            orderId: 'ab9c4ccb-264e-4cf0-a4a4-ff77ba9d3491',
          },
        },
      },
    );
  });

  it('hiển thị pending và cho phép kiểm tra lại, không báo đã cộng Diamond', async () => {
    searchParams.set('paymentOrder', 'ab9c4ccb-264e-4cf0-a4a4-ff77ba9d3491');
    vi.spyOn(apiClient, 'GET').mockResolvedValue({
      data: {
        data: {
          orderId: 'ab9c4ccb-264e-4cf0-a4a4-ff77ba9d3491',
          status: 'pending',
          transactionId: null,
          diamonds: '550',
        },
      },
    } as never);

    renderStatus();

    expect(
      await screen.findByText(/đang chờ ngân hàng xác nhận/i),
    ).toBeVisible();
    expect(screen.getByRole('button', { name: /kiểm tra lại/i })).toBeVisible();
    expect(screen.queryByText(/đã cộng/i)).not.toBeInTheDocument();
  });

  it.each(['expired', 'cancelled'] as const)(
    'hiển thị trạng thái %s mà không báo thanh toán thành công',
    async (status) => {
      searchParams.set('paymentOrder', 'ab9c4ccb-264e-4cf0-a4a4-ff77ba9d3491');
      vi.spyOn(apiClient, 'GET').mockResolvedValue({
        data: {
          data: {
            orderId: 'ab9c4ccb-264e-4cf0-a4a4-ff77ba9d3491',
            status,
            transactionId: null,
            diamonds: '550',
          },
        },
      } as never);

      renderStatus();

      expect(await screen.findByText(/đã hết hạn hoặc bị huỷ/i)).toBeVisible();
      expect(screen.queryByText(/đã cộng/i)).not.toBeInTheDocument();
    },
  );
});
