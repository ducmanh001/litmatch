import { ApiError } from '@litmatch/api-client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { vi } from 'vitest';

import { MovieSessionView } from './movie-session-view';
import { apiClient } from '../../../shared/api/client';

import type { MovieSessionDto } from '../api';

vi.mock('../../../shared/realtime/use-realtime-event', () => ({
  useRealtimeEvent: vi.fn(),
}));

function sessionFixture(
  overrides: Partial<MovieSessionDto> = {},
): MovieSessionDto {
  return {
    id: 'session-1',
    partnerUserId: 'friend-1',
    videoUrl: 'https://www.youtube.com/watch?v=abc123',
    positionSeconds: 10,
    isPlaying: false,
    positionUpdatedAt: new Date().toISOString(),
    status: 'active',
    endedAt: null,
    endReason: null,
    ...overrides,
  };
}

function renderView(sessionId = 'session-1') {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <MovieSessionView sessionId={sessionId} />
    </QueryClientProvider>,
  );
}

describe('MovieSessionView', () => {
  afterEach(() => vi.restoreAllMocks());

  it('đang tải — hiện trạng thái loading', () => {
    vi.spyOn(apiClient, 'GET').mockImplementation(
      () => new Promise(() => undefined),
    );
    renderView();
    expect(screen.getByText(/Đang tải phiên xem chung/)).toBeVisible();
  });

  it('404 — luôn hiện message chung, không phân biệt lý do (IDOR)', async () => {
    vi.spyOn(apiClient, 'GET').mockRejectedValue(
      new ApiError(404, {
        code: 'MOVIE_SESSION_NOT_FOUND',
        message: 'chi tiết nội bộ không nên lộ ra UI',
        traceId: 't',
      }),
    );
    renderView();
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Không tìm thấy phiên xem chung.',
    );
  });

  it('lỗi khác 404 — hiện message từ server', async () => {
    vi.spyOn(apiClient, 'GET').mockRejectedValue(
      new ApiError(500, {
        code: 'INTERNAL',
        message: 'Lỗi server.',
        traceId: 't',
      }),
    );
    renderView();
    expect(await screen.findByRole('alert')).toHaveTextContent('Lỗi server.');
  });

  it('session đã kết thúc — hiện thông báo đã kết thúc, không render player', async () => {
    vi.spyOn(apiClient, 'GET').mockResolvedValue({
      data: {
        data: sessionFixture({
          status: 'ended',
          endedAt: new Date().toISOString(),
          endReason: 'left',
        }),
      },
    } as never);
    renderView();
    expect(
      await screen.findByText(/Phiên xem chung đã kết thúc/),
    ).toBeVisible();
    expect(
      screen.queryByRole('button', { name: /Kết thúc/ }),
    ).not.toBeInTheDocument();
  });

  it('session active — render player + nút kết thúc, bấm thì gọi API end', async () => {
    vi.spyOn(apiClient, 'GET').mockResolvedValue({
      data: { data: sessionFixture() },
    } as never);
    const post = vi.spyOn(apiClient, 'POST').mockResolvedValue({
      data: { data: sessionFixture({ status: 'ended' }) },
    } as never);

    renderView();
    const user = userEvent.setup();
    const endButton = await screen.findByRole('button', { name: /Kết thúc/ });
    await user.click(endButton);

    await vi.waitFor(() =>
      expect(post).toHaveBeenCalledWith(
        '/api/v1/movie-match/sessions/{id}/end',
        expect.objectContaining({ params: { path: { id: 'session-1' } } }),
      ),
    );
  });
});
