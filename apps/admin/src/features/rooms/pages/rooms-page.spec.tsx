import { ApiError } from '@litmatch/api-client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { vi } from 'vitest';

import { RoomsPage } from './rooms-page';
import { apiClient } from '../../../shared/api/client';

import type { AdminRoomDto } from '../api';

function renderPage() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <RoomsPage />
    </QueryClientProvider>,
  );
}

const room = (overrides: Partial<AdminRoomDto> = {}): AdminRoomDto => ({
  id: 'rm1',
  hostUserId: 'host-uuid-1',
  title: 'Tối nay cùng Mai Anh',
  status: 'active',
  speakerLimit: 8,
  category: 'talk',
  memberCount: 5,
  closeReason: null,
  createdAt: new Date().toISOString(),
  hostDisconnectedAt: null,
  ...overrides,
});

describe('RoomsPage', () => {
  afterEach(() => vi.restoreAllMocks());

  it('empty — hiện EmptyState', async () => {
    // Body thật của GET /admin/rooms là chính AdminRoomsPageDto `{data, meta}` —
    // ResponseEnvelopeInterceptor pass-through payload đã có key `data`, KHÔNG bọc thêm lớp.
    vi.spyOn(apiClient, 'GET').mockResolvedValue({
      data: { data: [], meta: { nextCursor: null } },
    } as never);
    renderPage();

    expect(
      await screen.findByText('Không có phòng nào đang hoạt động'),
    ).toBeVisible();
  });

  it('error — hiện message', async () => {
    vi.spyOn(apiClient, 'GET').mockRejectedValue(
      new ApiError(500, { code: 'X', message: 'Lỗi server', traceId: 't' }),
    );
    renderPage();

    expect(await screen.findByRole('alert')).toHaveTextContent('Lỗi server');
  });

  it('data — hiện số member và kết thúc phòng qua endpoint admin', async () => {
    vi.spyOn(apiClient, 'GET').mockResolvedValue({
      data: { data: [room()], meta: { nextCursor: null } },
    } as never);
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    const postSpy = vi.spyOn(apiClient, 'POST').mockResolvedValue({
      data: { data: { closed: true } },
    } as never);
    renderPage();

    expect(await screen.findByText('Tối nay cùng Mai Anh')).toBeVisible();
    expect(screen.getByText('8')).toBeVisible();
    expect(screen.getByText('5')).toBeVisible();
    await act(async () =>
      fireEvent.click(screen.getByRole('button', { name: 'Kết thúc phòng' })),
    );
    expect(postSpy).toHaveBeenCalledWith('/api/v1/admin/rooms/{id}/close', {
      params: { path: { id: 'rm1' } },
    });
  });
});
