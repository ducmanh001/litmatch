import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
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
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

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

  it('tab "Đang theo dõi" gọi lại feed với feed=following và có empty state riêng', async () => {
    const getSpy = vi.spyOn(apiClient, 'GET').mockResolvedValue({
      data: { data: { items: [], nextCursor: null } },
    } as never);

    renderFeed();

    const followingTab = await screen.findByRole('button', {
      name: 'Đang theo dõi',
    });
    expect(followingTab).toBeEnabled();
    await userEvent.click(followingTab);

    await waitFor(() =>
      expect(getSpy).toHaveBeenCalledWith(
        '/api/v1/videos',
        expect.objectContaining({
          params: expect.objectContaining({
            query: expect.objectContaining({ feed: 'following' }),
          }),
        }),
      ),
    );
    expect(
      await screen.findByText('Chưa có video nào từ bạn bè của bạn.'),
    ).toBeVisible();
  });

  it('đổi slide active thì reset reaction cục bộ theo đúng video mới', async () => {
    const videos: VideoDto[] = [
      {
        id: 'video-1',
        authorUserId: 'u1',
        status: 'published',
        playbackUrl: 'https://cdn.example.com/v1.mp4',
        thumbnailUrl: null,
        caption: 'Video thứ nhất',
        durationSeconds: 15,
        viewCount: 42,
        likeCount: 5,
        commentCount: 3,
        createdAt: new Date().toISOString(),
      },
      {
        id: 'video-2',
        authorUserId: 'u2',
        status: 'published',
        playbackUrl: 'https://cdn.example.com/v2.mp4',
        thumbnailUrl: null,
        caption: 'Video thứ hai',
        durationSeconds: 18,
        viewCount: 30,
        likeCount: 12,
        commentCount: 4,
        createdAt: new Date().toISOString(),
      },
    ];
    const intersectionCallbacks: IntersectionObserverCallback[] = [];
    class MockIntersectionObserver implements IntersectionObserver {
      readonly root = null;
      readonly rootMargin = '0px';
      readonly thresholds = [0.6];
      constructor(callback: IntersectionObserverCallback) {
        intersectionCallbacks.push(callback);
      }
      disconnect = vi.fn();
      observe = vi.fn();
      takeRecords = vi.fn(() => []);
      unobserve = vi.fn();
    }
    vi.stubGlobal('IntersectionObserver', MockIntersectionObserver);
    vi.spyOn(HTMLMediaElement.prototype, 'play').mockResolvedValue(undefined);
    vi.spyOn(HTMLMediaElement.prototype, 'pause').mockImplementation(
      () => undefined,
    );
    vi.spyOn(apiClient, 'GET').mockImplementation(async (path: string) => {
      if (path === '/api/v1/videos') {
        return {
          data: { data: { items: videos, nextCursor: null } },
        } as never;
      }
      if (path === '/api/v1/users/{id}') {
        return {
          data: {
            data: {
              id: 'user',
              nickname: 'Thành viên',
              gender: 'unknown',
              avatarId: null,
            },
          },
        } as never;
      }
      throw new Error(`unexpected GET ${path}`);
    });
    vi.spyOn(apiClient, 'POST').mockResolvedValue({
      data: { data: { liked: true, likeCount: 6 } },
    } as never);

    renderFeed();
    await screen.findByText('Video thứ hai');
    const firstLike = screen.getByRole('button', { name: '5' });
    await userEvent.click(firstLike);
    expect(await screen.findByRole('button', { name: '6' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );

    expect(intersectionCallbacks).toHaveLength(2);
    await act(async () => {
      intersectionCallbacks[1]?.(
        [{ isIntersecting: true } as IntersectionObserverEntry],
        {} as IntersectionObserver,
      );
    });

    expect(await screen.findByRole('button', { name: '12' })).toHaveAttribute(
      'aria-pressed',
      'false',
    );

    await act(async () => {
      intersectionCallbacks[0]?.(
        [{ isIntersecting: true } as IntersectionObserverEntry],
        {} as IntersectionObserver,
      );
    });

    expect(await screen.findByRole('button', { name: '6' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
  });
});
