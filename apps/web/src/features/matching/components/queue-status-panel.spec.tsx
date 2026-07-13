import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { vi } from 'vitest';

import { QueueStatusPanel } from './queue-status-panel';
import { apiClient } from '../../../shared/api/client';

import type { TicketDto } from '../api';

const { routerReplace } = vi.hoisted(() => ({ routerReplace: vi.fn() }));
vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: routerReplace }),
}));

function ticketFixture(overrides: Partial<TicketDto>): TicketDto {
  return {
    id: 'ticket-1',
    matchType: 'soul',
    status: 'queued',
    region: 'vn',
    ageBand: 1,
    genderPreference: 'any',
    sessionId: null,
    enqueuedAt: new Date().toISOString(),
    createdAt: new Date().toISOString(),
    ...overrides,
  };
}

function renderPanel() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <QueueStatusPanel />
    </QueryClientProvider>,
  );
}

async function joinQueueAndReachTicket(ticket: TicketDto) {
  vi.spyOn(apiClient, 'POST').mockImplementation(async (path: string) => {
    if (path === '/api/v1/matching/tickets') {
      return { data: { data: ticket } } as never;
    }
    throw new Error(`unexpected POST ${path}`);
  });
  vi.spyOn(apiClient, 'GET').mockResolvedValue({
    data: { data: ticket },
  } as never);

  renderPanel();
  await userEvent.click(screen.getByRole('button', { name: 'Tìm ghép đôi' }));
}

describe('QueueStatusPanel', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    routerReplace.mockClear();
  });

  it('chưa có ticket — hiển thị form chọn kiểu ghép đôi', () => {
    renderPanel();
    expect(
      screen.getByRole('button', { name: 'Tìm ghép đôi' }),
    ).toBeInTheDocument();
  });

  it('status queued — hiển thị nút Huỷ và Ưu tiên', async () => {
    await joinQueueAndReachTicket(ticketFixture({ status: 'queued' }));

    expect(await screen.findByText(/Đang tìm người ghép đôi/)).toBeVisible();
    expect(screen.getByRole('button', { name: 'Huỷ' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Ưu tiên/ })).toBeInTheDocument();
  });

  it('status matched — hiển thị nút xác nhận', async () => {
    await joinQueueAndReachTicket(ticketFixture({ status: 'matched' }));

    expect(
      await screen.findByRole('button', { name: 'Xác nhận' }),
    ).toBeVisible();
  });

  it('status confirmed — điều hướng theo matchType', async () => {
    await joinQueueAndReachTicket(
      ticketFixture({
        status: 'confirmed',
        sessionId: 'session-1',
        matchType: 'voice',
      }),
    );

    await waitFor(() =>
      expect(routerReplace).toHaveBeenCalledWith('/matching/voice/session-1'),
    );
  });

  it('status expired — cho phép tìm lại', async () => {
    await joinQueueAndReachTicket(ticketFixture({ status: 'expired' }));

    expect(await screen.findByText('Ticket đã hết hạn.')).toBeVisible();
    await userEvent.click(screen.getByRole('button', { name: 'Tìm lại' }));
    expect(
      screen.getByRole('button', { name: 'Tìm ghép đôi' }),
    ).toBeInTheDocument();
  });

  it('status cancelled — cho phép tìm lại', async () => {
    await joinQueueAndReachTicket(ticketFixture({ status: 'cancelled' }));

    expect(await screen.findByText('Đã huỷ ticket.')).toBeVisible();
  });
});
