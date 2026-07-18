import { ApiError } from '@litmatch/api-client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { vi } from 'vitest';

import { PostList } from './post-list';
import { apiClient, tokenStore } from '../../../shared/api/client';
import { currentUserKey } from '../../../shared/auth/use-current-user';

import type { PostDto, ReactionStatusDto } from '../api';

function renderList(currentUserId?: string) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  if (currentUserId !== undefined) {
    queryClient.setQueryData(currentUserKey, {
      id: currentUserId,
      nickname: 'Tôi',
      gender: 'unknown',
      avatarId: null,
    });
  }
  return render(
    <QueryClientProvider client={queryClient}>
      <PostList />
    </QueryClientProvider>,
  );
}

describe('PostList', () => {
  afterEach(() => {
    tokenStore.setSession(null);
    vi.restoreAllMocks();
  });

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
      author: {
        id: 'u1',
        nickname: 'Mây Nhỏ',
        gender: 'unknown',
        avatarId: 'avatar-1',
        interests: null,
      },
      content: 'Xin chào mọi người',
      imageUrl: null,
      audience: 'public',
      likeCount: 3,
      commentCount: 2,
      createdAt: new Date().toISOString(),
    };
    const reaction: ReactionStatusDto = { liked: false, likeCount: 3 };
    const getSpy = vi
      .spyOn(apiClient, 'GET')
      .mockImplementation(async (path: string) => {
        if (path === '/api/v1/feed/posts') {
          return {
            data: { data: { items: [post], nextCursor: null } },
          } as never;
        }
        if (path === '/api/v1/feed/posts/{postId}/reactions') {
          return { data: { data: reaction } } as never;
        }
        throw new Error(`unexpected GET ${path}`);
      });

    renderList();

    expect(await screen.findByText('Xin chào mọi người')).toBeVisible();
    expect(await screen.findByText('Mây Nhỏ')).toBeVisible();
    expect(screen.getByText('Công khai')).toBeVisible();
    expect(getSpy).not.toHaveBeenCalledWith(
      '/api/v1/users/{id}',
      expect.anything(),
    );
    expect(
      screen.getByRole('link', {
        name: 'Bình luận bài viết, 2 bình luận',
      }),
    ).toHaveAttribute('href', '/feed/post-1');
  });

  it('response API cũ chưa có author vẫn render được trong lúc core-api reload', async () => {
    const legacyPost = {
      id: 'post-legacy',
      authorUserId: 'u-legacy',
      content: 'Bài viết từ API cũ',
      imageUrl: null,
      audience: 'public',
      likeCount: 0,
      commentCount: 0,
      createdAt: new Date().toISOString(),
    };
    vi.spyOn(apiClient, 'GET').mockImplementation(async (path: string) => {
      if (path === '/api/v1/feed/posts') {
        return {
          data: { data: { items: [legacyPost], nextCursor: null } },
        } as never;
      }
      if (path === '/api/v1/feed/posts/{postId}/reactions') {
        return { data: { data: { liked: false, likeCount: 0 } } } as never;
      }
      throw new Error(`unexpected GET ${path}`);
    });

    renderList();

    expect(await screen.findByText('Bài viết từ API cũ')).toBeVisible();
    expect(screen.getByText('Người dùng')).toBeVisible();
  });

  it('nội dung dài — clamp mặc định và cho xem thêm/thu gọn', async () => {
    const longContent =
      'Một câu chuyện dài cần được trình bày gọn gàng. '.repeat(12);
    const post: PostDto = {
      id: 'post-long',
      authorUserId: 'u-long',
      author: {
        id: 'u-long',
        nickname: 'Người kể chuyện',
        gender: 'unknown',
        avatarId: 'avatar-long',
        interests: null,
      },
      content: longContent,
      imageUrl: null,
      audience: 'public',
      likeCount: 0,
      commentCount: 0,
      createdAt: new Date().toISOString(),
    };

    vi.spyOn(apiClient, 'GET').mockImplementation(async (path: string) => {
      if (path === '/api/v1/feed/posts') {
        return { data: { data: { items: [post], nextCursor: null } } } as never;
      }
      if (path === '/api/v1/feed/posts/{postId}/reactions') {
        return {
          data: { data: { liked: false, likeCount: 0 } },
        } as never;
      }
      throw new Error(`unexpected GET ${path}`);
    });

    renderList();

    const content = await screen.findByText(longContent.trim());
    expect(content).toHaveClass('line-clamp-6');
    expect(content.className).toContain('[overflow-wrap:anywhere]');

    await userEvent.click(screen.getByRole('button', { name: 'Xem thêm' }));
    expect(content).not.toHaveClass('line-clamp-6');
    expect(screen.getByRole('button', { name: 'Thu gọn' })).toHaveAttribute(
      'aria-expanded',
      'true',
    );
  });

  it('menu bài của mình nhận focus và đóng bằng phím Escape', async () => {
    tokenStore.setSession({ accessToken: 'a', csrfToken: 'r' });
    const post: PostDto = {
      id: 'post-owner',
      authorUserId: 'me',
      author: {
        id: 'me',
        nickname: 'Tôi',
        gender: 'unknown',
        avatarId: 'avatar-me',
        interests: null,
      },
      content: 'Bài viết của tôi',
      imageUrl: null,
      audience: 'friends',
      likeCount: 0,
      commentCount: 0,
      createdAt: new Date().toISOString(),
    };
    vi.spyOn(apiClient, 'GET').mockImplementation(async (path: string) => {
      if (path === '/api/v1/feed/posts') {
        return { data: { data: { items: [post], nextCursor: null } } } as never;
      }
      if (path === '/api/v1/feed/posts/{postId}/reactions') {
        return { data: { data: { liked: false, likeCount: 0 } } } as never;
      }
      throw new Error(`unexpected GET ${path}`);
    });

    renderList('me');
    const trigger = await screen.findByRole('button', {
      name: 'Tuỳ chọn bài viết',
    });
    await userEvent.click(trigger);

    const deleteButton = screen.getByRole('button', { name: 'Xoá bài viết' });
    expect(deleteButton).toHaveFocus();
    expect(trigger).toHaveAttribute('aria-expanded', 'true');

    await userEvent.keyboard('{Escape}');
    expect(trigger).toHaveFocus();
    expect(trigger).toHaveAttribute('aria-expanded', 'false');
  });
});
