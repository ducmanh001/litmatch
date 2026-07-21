import { ApiError } from '@litmatch/api-client';
import { RealtimeEvents } from '@litmatch/common-dtos/pure';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { vi } from 'vitest';

import { QueueStatusPanel } from './queue-status-panel';
import { apiClient } from '../../../shared/api/client';

import type { TicketDto } from '../api';

const { routerReplace, searchParams } = vi.hoisted(() => ({
  routerReplace: vi.fn(),
  searchParams: new URLSearchParams(),
}));
vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: routerReplace }),
  useSearchParams: () => searchParams,
}));

const { realtimeHandlers } = vi.hoisted(() => ({
  realtimeHandlers: new Map<string, (data: unknown) => void>(),
}));
vi.mock('../../../shared/realtime/use-realtime-event', () => ({
  useRealtimeEvent: (event: string, handler: (data: unknown) => void) => {
    realtimeHandlers.set(event, handler);
  },
}));

function ticketFixture(overrides: Partial<TicketDto>): TicketDto {
  return {
    id: 'ticket-1',
    matchType: 'soul',
    status: 'queued',
    speedupPriceDiamond: 50,
    region: 'vn',
    ageBand: 1,
    genderPreference: 'any',
    sessionId: null,
    enqueuedAt: new Date().toISOString(),
    createdAt: new Date().toISOString(),
    ...overrides,
  };
}

function renderPanel({
  currentTicket = null,
  ticketById = currentTicket,
  currentError,
}: {
  currentTicket?: TicketDto | null;
  ticketById?: TicketDto | null;
  currentError?: Error;
} = {}) {
  vi.spyOn(apiClient, 'GET').mockImplementation(async (path: string) => {
    if (path === '/api/v1/matching/tickets/current') {
      if (currentError !== undefined) throw currentError;
      return { data: { data: { ticket: currentTicket } } } as never;
    }
    if (path === '/api/v1/matching/tickets/{id}' && ticketById !== null) {
      return { data: { data: ticketById } } as never;
    }
    throw new Error(`unexpected GET ${path}`);
  });
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

  renderPanel({ ticketById: ticket });
  await userEvent.click(
    await screen.findByRole('button', {
      name: 'Bắt đầu ghép đôi Tâm hồn',
    }),
  );
}

describe('QueueStatusPanel', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    routerReplace.mockClear();
    realtimeHandlers.clear();
    searchParams.delete('match');
    searchParams.delete('start');
  });

  it('chưa có ticket — hiển thị form chọn kiểu ghép đôi', async () => {
    renderPanel();
    expect(
      await screen.findByRole('button', {
        name: 'Bắt đầu ghép đôi Tâm hồn',
      }),
    ).toBeInTheDocument();
  });

  it('đổi sang Voice — CTA phản ánh đúng lựa chọn của người dùng', async () => {
    renderPanel();
    await userEvent.click(
      await screen.findByRole('radio', { name: /Ghép đôi Voice/ }),
    );

    expect(
      screen.getByRole('button', { name: 'Bắt đầu ghép đôi Voice' }),
    ).toBeVisible();
    expect(screen.getByText(/Chọn Voice không trừ diamond/)).toBeVisible();
  });

  it('status queued — hiển thị nút Huỷ và Ưu tiên', async () => {
    await joinQueueAndReachTicket(ticketFixture({ status: 'queued' }));

    expect(await screen.findByText(/Đang tìm người ghép đôi/)).toBeVisible();
    expect(
      screen.getByRole('button', { name: 'Huỷ tìm kiếm' }),
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Ưu tiên/ })).toBeInTheDocument();
  });

  it('reload khi có ticket active — tự khôi phục hàng chờ, không bắt join lại', async () => {
    const activeTicket = ticketFixture({ status: 'queued' });
    const post = vi.spyOn(apiClient, 'POST');

    renderPanel({ currentTicket: activeTicket, ticketById: activeTicket });

    expect(await screen.findByText(/Đang tìm người ghép đôi/)).toBeVisible();
    expect(
      screen.queryByRole('button', { name: 'Bắt đầu ghép đôi Tâm hồn' }),
    ).not.toBeInTheDocument();
    expect(post).not.toHaveBeenCalled();
  });

  it('không khôi phục được ticket — hiện lỗi và cho thử lại thay vì mở form mới', async () => {
    renderPanel({ currentError: new Error('offline') });

    expect(
      await screen.findByText('Không tải được phiên ghép đôi trước đó'),
    ).toBeVisible();
    expect(screen.getByRole('button', { name: 'Thử lại' })).toBeVisible();
    expect(
      screen.queryByRole('button', { name: 'Bắt đầu ghép đôi Tâm hồn' }),
    ).not.toBeInTheDocument();
  });

  it('status matched legacy — tự hoàn tất, không hiện nút xác nhận', async () => {
    await joinQueueAndReachTicket(ticketFixture({ status: 'matched' }));

    expect(
      await screen.findByText('Đang mở phòng trò chuyện cho hai bạn…'),
    ).toBeVisible();
    expect(
      screen.queryByRole('button', { name: 'Xác nhận kết nối' }),
    ).not.toBeInTheDocument();
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

    expect(await screen.findByText('Phiên tìm kiếm đã hết hạn')).toBeVisible();
    await userEvent.click(screen.getByRole('button', { name: 'Tìm lại' }));
    expect(
      screen.getByRole('button', { name: 'Bắt đầu ghép đôi Tâm hồn' }),
    ).toBeInTheDocument();
  });

  it('status cancelled — cho phép tìm lại', async () => {
    await joinQueueAndReachTicket(ticketFixture({ status: 'cancelled' }));

    expect(await screen.findByText('Đã huỷ tìm kiếm')).toBeVisible();
  });

  it('huỷ ticket lỗi — hiển thị lỗi để người dùng có thể thử lại', async () => {
    vi.spyOn(apiClient, 'DELETE').mockRejectedValue(
      new ApiError(409, {
        code: 'MATCHING_TICKET_INVALID_TRANSITION',
        message: 'Không thể huỷ phiên này.',
        traceId: 'trace-cancel',
      }),
    );
    await joinQueueAndReachTicket(ticketFixture({ status: 'queued' }));

    await userEvent.click(
      await screen.findByRole('button', { name: 'Huỷ tìm kiếm' }),
    );

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Không thể huỷ phiên này.',
    );
  });

  it('session legacy lỗi khi tự hoàn tất — hiển thị lỗi mà không dựng CTA xác nhận', async () => {
    vi.spyOn(apiClient, 'POST').mockRejectedValue(
      new ApiError(409, {
        code: 'MATCHING_TICKET_EXPIRED',
        message: 'Phiên ghép đôi đã hết hạn.',
        traceId: 'trace-confirm',
      }),
    );
    const legacyTicket = ticketFixture({ status: 'matched' });
    renderPanel({ currentTicket: legacyTicket, ticketById: legacyTicket });

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Phiên ghép đôi đã hết hạn.',
    );
    expect(
      screen.queryByRole('button', { name: 'Xác nhận kết nối' }),
    ).not.toBeInTheDocument();
  });

  it('chỉ vào hàng đợi sau khi mobile CTA đã được xác nhận', async () => {
    searchParams.set('match', 'voice');
    searchParams.set('start', '1');
    const post = vi.spyOn(apiClient, 'POST').mockResolvedValue({
      data: { data: ticketFixture({ matchType: 'voice' }) },
    } as never);
    renderPanel({ ticketById: ticketFixture({ matchType: 'voice' }) });

    expect(await screen.findByText(/Đang tìm người ghép đôi/)).toBeVisible();
    expect(post).toHaveBeenCalledWith(
      '/api/v1/matching/tickets',
      expect.objectContaining({
        body: { matchType: 'voice', genderPreference: 'any' },
      }),
    );
  });

  it('đổi loại khi đang quét — huỷ ticket cũ trước', async () => {
    searchParams.set('match', 'voice');
    const activeTicket = ticketFixture({ matchType: 'soul' });
    const remove = vi.spyOn(apiClient, 'DELETE').mockResolvedValue({
      data: { data: { ...activeTicket, status: 'cancelled' } },
    } as never);

    renderPanel({ currentTicket: activeTicket, ticketById: activeTicket });

    await waitFor(() =>
      expect(remove).toHaveBeenCalledWith(
        '/api/v1/matching/tickets/{id}',
        expect.objectContaining({ params: { path: { id: activeTicket.id } } }),
      ),
    );
  });

  it('chưa có ticket — nhận match.confirmed từ lời mời và chuyển vào phòng ngay', async () => {
    const invitedTicket = ticketFixture({
      id: 'ticket-from-invite',
      status: 'confirmed',
      sessionId: 'session-from-invite',
    });
    renderPanel({ ticketById: invitedTicket });

    // Chưa từng bấm "Tìm ghép đôi" — invite vừa được accept sẽ publish match.confirmed.
    expect(
      await screen.findByRole('button', {
        name: 'Bắt đầu ghép đôi Tâm hồn',
      }),
    ).toBeInTheDocument();
    realtimeHandlers.get(RealtimeEvents.MatchConfirmed)?.({
      ticketId: 'ticket-from-invite',
      sessionId: 'session-from-invite',
    });

    await waitFor(() =>
      expect(routerReplace).toHaveBeenCalledWith(
        '/matching/soul/session-from-invite',
      ),
    );
  });
});
