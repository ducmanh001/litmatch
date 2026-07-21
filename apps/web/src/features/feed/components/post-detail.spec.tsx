import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import { vi } from 'vitest';

import { PostDetail } from './post-detail';
import { apiClient } from '../../../shared/api/client';

function renderDetail() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <PostDetail postId="post-1" />
    </QueryClientProvider>,
  );
}

describe('PostDetail', () => {
  afterEach(() => vi.restoreAllMocks());

  it('dùng đầy đủ thông tin tác giả và đưa hành động bình luận tới composer', async () => {
    vi.spyOn(apiClient, 'GET').mockImplementation(async (path: string) => {
      if (path === '/api/v1/feed/posts/{postId}') {
        return {
          data: {
            data: {
              id: 'post-1',
              authorUserId: 'user-1',
              author: {
                id: 'user-1',
                nickname: 'Mây Nhỏ',
                gender: 'unknown',
                avatarId: 'avatar-1',
                interests: null,
              },
              content: 'Muốn tìm một người cùng đi xem triển lãm cuối tuần.',
              imageUrl: null,
              audience: 'public',
              likeCount: 4,
              commentCount: 2,
              createdAt: new Date().toISOString(),
            },
          },
        } as never;
      }
      if (path === '/api/v1/feed/posts/{postId}/reactions') {
        return { data: { data: { liked: false, likeCount: 4 } } } as never;
      }
      if (path === '/api/v1/feed/posts/{postId}/comments') {
        return {
          data: {
            data: {
              items: [
                {
                  id: 'comment-1',
                  postId: 'post-1',
                  authorUserId: 'user-2',
                  author: {
                    id: 'user-2',
                    nickname: 'Nắng',
                    gender: 'unknown',
                    avatarId: 'avatar-2',
                    interests: null,
                  },
                  content: 'Mình cũng muốn đi!',
                  createdAt: new Date().toISOString(),
                },
              ],
              nextCursor: null,
            },
          },
        } as never;
      }
      throw new Error(`unexpected GET ${path}`);
    });

    renderDetail();

    expect(await screen.findByText('Mây Nhỏ')).toBeVisible();
    expect(await screen.findByText('Nắng')).toBeVisible();
    expect(screen.getByText('Nắng').closest('a')).toHaveAttribute(
      'href',
      '/users/user-2',
    );
    expect(screen.getByText('Công khai')).toBeVisible();
    expect(
      screen.getByRole('link', {
        name: 'Bình luận bài viết, 2 bình luận',
      }),
    ).toHaveAttribute('href', '#binh-luan');
    expect(screen.getByRole('region', { name: 'Bình luận' })).toContainElement(
      screen.getByRole('textbox', { name: 'Nội dung bình luận' }),
    );
  });
});
