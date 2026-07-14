import { ApiError } from '@litmatch/api-client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import { vi } from 'vitest';

import { PostList } from './post-list';
import { apiClient } from '../../../shared/api/client';

import type { PostDto, ReactionStatusDto } from '../api';

function renderList() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <PostList />
    </QueryClientProvider>,
  );
}

describe('PostList', () => {
  afterEach(() => vi.restoreAllMocks());

  it('empty — gợi ý đăng bài đầu tiên', async () => {
    vi.spyOn(apiClient, 'GET').mockResolvedValue({
      data: { data: { items: [], nextCursor: null } },
    } as never);
    renderList();

    expect(await screen.findByText(/Chưa có bài viết nào/)).toBeVisible();
  });

  it('error — hiển thị message', async () => {
    vi.spyOn(apiClient, 'GET').mockRejectedValue(
      new ApiError(500, { code: 'X', message: 'Lỗi server', traceId: 't' }),
    );
    renderList();

    expect(await screen.findByRole('alert')).toHaveTextContent('Lỗi server');
  });

  it('data — hiển thị bài viết + link vào đúng /feed/:id', async () => {
    const post: PostDto = {
      id: 'post-1',
      authorUserId: 'u1',
      content: 'Xin chào mọi người',
      imageUrl: null,
      likeCount: 3,
      commentCount: 2,
      createdAt: new Date().toISOString(),
    };
    const reaction: ReactionStatusDto = { liked: false, likeCount: 3 };
    vi.spyOn(apiClient, 'GET').mockImplementation(async (path: string) => {
      if (path === '/api/v1/feed/posts') {
        return { data: { data: { items: [post], nextCursor: null } } } as never;
      }
      if (path === '/api/v1/feed/posts/{postId}/reactions') {
        return { data: { data: reaction } } as never;
      }
      throw new Error(`unexpected GET ${path}`);
    });

    renderList();

    expect(await screen.findByText('Xin chào mọi người')).toBeVisible();
    expect(screen.getByRole('link', { name: /2 bình luận/ })).toHaveAttribute(
      'href',
      '/feed/post-1',
    );
  });
});
