import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { vi } from 'vitest';

import { VideoLikeButton } from './video-like-button';
import { apiClient } from '../../../shared/api/client';

import type { VideoDto } from '../api';

const video: VideoDto = {
  id: 'video-1',
  authorUserId: 'u1',
  status: 'published',
  playbackUrl: 'https://cdn.example.com/v1.mp4',
  thumbnailUrl: null,
  caption: null,
  durationSeconds: 12,
  viewCount: 10,
  likeCount: 5,
  commentCount: 2,
  createdAt: new Date().toISOString(),
};

function renderButton() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <VideoLikeButton video={video} />
    </QueryClientProvider>,
  );
}

describe('VideoLikeButton', () => {
  afterEach(() => vi.restoreAllMocks());

  it('mặc định chưa thích, hiện likeCount từ video — bấm gọi POST reactions', async () => {
    const postSpy = vi.spyOn(apiClient, 'POST').mockResolvedValue({
      data: { data: { liked: true, likeCount: 6 } },
    } as never);

    renderButton();
    const button = screen.getByRole('button', { name: /5/ });
    expect(button).toHaveAttribute('aria-pressed', 'false');

    await userEvent.click(button);

    expect(postSpy).toHaveBeenCalledWith('/api/v1/videos/{id}/reactions', {
      params: { path: { id: 'video-1' } },
    });
    expect(await screen.findByRole('button', { name: /6/ })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
  });

  it('đã thích trong phiên — bấm lại gọi DELETE reactions', async () => {
    vi.spyOn(apiClient, 'POST').mockResolvedValue({
      data: { data: { liked: true, likeCount: 6 } },
    } as never);
    const deleteSpy = vi.spyOn(apiClient, 'DELETE').mockResolvedValue({
      data: { data: { liked: false, likeCount: 5 } },
    } as never);

    renderButton();
    await userEvent.click(screen.getByRole('button', { name: /5/ }));
    const likedButton = await screen.findByRole('button', { name: /6/ });

    await userEvent.click(likedButton);

    expect(deleteSpy).toHaveBeenCalledWith('/api/v1/videos/{id}/reactions', {
      params: { path: { id: 'video-1' } },
    });
    expect(await screen.findByRole('button', { name: /5/ })).toHaveAttribute(
      'aria-pressed',
      'false',
    );
  });
});
