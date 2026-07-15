import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import { ApiError } from '@litmatch/api-client';
import { vi } from 'vitest';

import { VideoReelFeed } from './video-reel-feed';
import { apiClient } from '../../../shared/api/client';

import type { VideoDto } from '../api';

function renderFeed() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <VideoReelFeed />
    </QueryClientProvider>,
  );
}

describe('VideoReelFeed', () => {
  afterEach(() => vi.restoreAllMocks());

  it('rỗng — hiện thông báo chưa có video', async () => {
    vi.spyOn(apiClient, 'GET').mockResolvedValue({
      data: { data: { items: [], nextCursor: null } },
    } as never);

    renderFeed();

    expect(await screen.findByText(/Chưa có video nào/)).toBeVisible();
  });

  it('lỗi — hiện message', async () => {
    vi.spyOn(apiClient, 'GET').mockRejectedValue(
      new ApiError(500, { code: 'X', message: 'Lỗi server', traceId: 't' }),
    );

    renderFeed();

    expect(await screen.findByRole('alert')).toHaveTextContent('Lỗi server');
  });

  it('có dữ liệu — hiện caption + số lượt thích/bình luận thật từ VideoDto', async () => {
    const video: VideoDto = {
      id: 'video-1',
      authorUserId: 'u1',
      status: 'published',
      playbackUrl: 'https://cdn.example.com/v1.mp4',
      thumbnailUrl: null,
      caption: 'Một ngày đẹp trời',
      durationSeconds: 15,
      viewCount: 42,
      likeCount: 7,
      commentCount: 3,
      createdAt: new Date().toISOString(),
    };
    vi.spyOn(apiClient, 'GET').mockResolvedValue({
      data: { data: { items: [video], nextCursor: null } },
    } as never);

    renderFeed();

    expect(await screen.findByText('Một ngày đẹp trời')).toBeVisible();
    expect(screen.getByRole('button', { name: /7/ })).toBeVisible();
    expect(screen.getByRole('button', { name: /3/ })).toBeVisible();
  });

  it('tab "Đang theo dõi" bị khoá vì backend chưa có feed lọc theo follow', async () => {
    vi.spyOn(apiClient, 'GET').mockResolvedValue({
      data: { data: { items: [], nextCursor: null } },
    } as never);

    renderFeed();

    expect(
      await screen.findByRole('button', { name: /Đang theo dõi/ }),
    ).toBeDisabled();
  });
});
