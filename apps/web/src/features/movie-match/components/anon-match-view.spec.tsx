import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { vi } from 'vitest';

import { AnonMatchView } from './anon-match-view';
import { apiClient } from '../../../shared/api/client';
import { ToastStack } from '../../../shared/ui/toast-stack';

import type { MovieAnonStateDto } from '../anon-api';

vi.mock('../../../shared/realtime/use-realtime-event', () => ({
  useRealtimeEvent: () => undefined,
}));
// YoutubePlayer chạm IFrame API thật — thay bằng placeholder trong jsdom
vi.mock('./youtube-player', () => ({
  YoutubePlayer: () => <div data-testid="yt-player" />,
}));

function renderView() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <AnonMatchView />
      <ToastStack />
    </QueryClientProvider>,
  );
}

function mockState(state: Partial<MovieAnonStateDto>) {
  vi.spyOn(apiClient, 'GET').mockImplementation(async (path: string) => {
    if (path === '/api/v1/movie-match/anon/current') {
      return { data: { data: state } } as never;
    }
    if (path === '/api/v1/movie-match/anon/sessions/{id}/messages') {
      return {
        data: { data: { items: [], meta: { nextCursor: null } } },
      } as never;
    }
    throw new Error(`unexpected GET ${path}`);
  });
}

describe('AnonMatchView', () => {
  afterEach(() => vi.restoreAllMocks());

  it('idle → CTA "Tìm bạn xem cùng" gọi POST queue rồi hiện màn tìm kiếm', async () => {
    // GET current phản ánh state server SAU khi join (poll/invalidate đọc lại)
    let serverState: Partial<MovieAnonStateDto> = { state: 'idle' };
    vi.spyOn(apiClient, 'GET').mockImplementation(async () => {
      return { data: { data: serverState } } as never;
    });
    const postSpy = vi.spyOn(apiClient, 'POST').mockImplementation(async () => {
      serverState = { state: 'queued', queuedAt: new Date().toISOString() };
      return { data: { data: serverState } } as never;
    });

    renderView();
    await userEvent.click(
      await screen.findByRole('button', { name: 'Tìm bạn xem cùng' }),
    );

    expect(postSpy).toHaveBeenCalledWith('/api/v1/movie-match/anon/queue');
    expect(
      await screen.findByText('Đang tìm bạn xem cùng...'),
    ).toBeInTheDocument();
  });

  it('queued → "Huỷ tìm kiếm" gọi DELETE current', async () => {
    mockState({ state: 'queued', queuedAt: new Date().toISOString() });
    const deleteSpy = vi.spyOn(apiClient, 'DELETE').mockResolvedValue({
      data: { data: { state: 'idle' } },
    } as never);

    renderView();
    await userEvent.click(
      await screen.findByRole('button', { name: 'Huỷ tìm kiếm' }),
    );
    expect(deleteSpy).toHaveBeenCalledWith('/api/v1/movie-match/anon/current');
  });

  it('watching → hiện "Người lạ ẩn danh" + timer + reaction + Kết thúc gửi finish', async () => {
    mockState({
      state: 'watching',
      sessionId: 's-1',
      videoUrl: 'https://www.youtube.com/watch?v=abc',
      positionSeconds: 0,
      isPlaying: false,
      positionUpdatedAt: new Date().toISOString(),
      expiresAt: new Date(Date.now() + 18 * 60 * 1000).toISOString(),
    });
    const postSpy = vi.spyOn(apiClient, 'POST').mockResolvedValue({
      data: { data: { state: 'rating', sessionId: 's-1' } },
    } as never);

    renderView();
    expect(await screen.findByText('Người lạ ẩn danh')).toBeVisible();
    expect(screen.getByText(/17:5\d|18:00/)).toBeVisible(); // timer từ expiresAt server

    await userEvent.click(screen.getByRole('button', { name: 'Thả 😂' }));
    expect(postSpy).toHaveBeenCalledWith(
      '/api/v1/movie-match/anon/sessions/{id}/reactions',
      { params: { path: { id: 's-1' } }, body: { emoji: '😂' } },
    );

    await userEvent.click(screen.getByRole('button', { name: 'Kết thúc' }));
    await waitFor(() =>
      expect(postSpy).toHaveBeenCalledWith(
        '/api/v1/movie-match/anon/sessions/{id}/finish',
        { params: { path: { id: 's-1' } } },
      ),
    );
  });

  it('rating → 3 nút gửi đúng rating', async () => {
    mockState({ state: 'rating', sessionId: 's-1' });
    const postSpy = vi.spyOn(apiClient, 'POST').mockResolvedValue({
      data: {
        data: { state: 'completed', sessionId: 's-1', outcome: 'not_matched' },
      },
    } as never);

    renderView();
    await userEvent.click(
      await screen.findByRole('button', { name: /Nhàm chán/ }),
    );
    expect(postSpy).toHaveBeenCalledWith(
      '/api/v1/movie-match/anon/sessions/{id}/rating',
      { params: { path: { id: 's-1' } }, body: { rating: 'boring' } },
    );
  });

  it('completed matched → mở link chat với partner thật', async () => {
    mockState({
      state: 'completed',
      sessionId: 's-1',
      outcome: 'matched',
      myRating: 'like',
      partnerUserId: 'u-9',
    });
    renderView();

    expect(await screen.findByText('Hai bạn đã thích nhau!')).toBeVisible();
    expect(screen.getByRole('link', { name: 'Nhắn tin ngay' })).toHaveAttribute(
      'href',
      '/chat/u-9',
    );
  });
});
