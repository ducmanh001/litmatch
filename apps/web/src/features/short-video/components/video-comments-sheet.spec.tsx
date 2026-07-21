import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { vi } from 'vitest';

import { VideoCommentsSheet } from './video-comments-sheet';
import { apiClient } from '../../../shared/api/client';

describe('VideoCommentsSheet', () => {
  it('ẩn khỏi a11y khi đóng, nhận focus và hỗ trợ Escape khi mở', async () => {
    const onClose = vi.fn();
    const { container, rerender } = render(
      <VideoCommentsSheet
        videoId={null}
        commentCount={0}
        open={false}
        onClose={onClose}
      />,
    );
    const sheet = container.querySelector('.video-comments-sheet');

    expect(sheet).toHaveAttribute('aria-hidden', 'true');
    expect(sheet).toHaveAttribute('inert');

    rerender(
      <VideoCommentsSheet
        videoId={null}
        commentCount={0}
        open
        onClose={onClose}
      />,
    );

    expect(
      screen.getByRole('dialog', { name: '0 bình luận' }),
    ).not.toHaveAttribute('inert');
    expect(screen.getByRole('button', { name: 'Đóng' })).toHaveFocus();

    await userEvent.keyboard('{Escape}');
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('hiển thị nickname và link hồ sơ của tác giả comment từ response video', async () => {
    vi.spyOn(apiClient, 'GET').mockResolvedValue({
      data: {
        data: {
          items: [
            {
              id: 'comment-1',
              videoId: 'video-1',
              authorUserId: 'user-1',
              author: {
                id: 'user-1',
                nickname: 'Mây Nhỏ',
                gender: 'unknown',
                avatarId: 'avatar-1',
                interests: null,
              },
              content: 'Video dễ thương quá!',
              createdAt: new Date().toISOString(),
            },
          ],
          nextCursor: null,
        },
      },
    } as never);
    const queryClient = new QueryClient({
      defaultOptions: {
        queries: { retry: false },
        mutations: { retry: false },
      },
    });

    render(
      <QueryClientProvider client={queryClient}>
        <VideoCommentsSheet
          videoId="video-1"
          commentCount={1}
          open
          onClose={vi.fn()}
        />
      </QueryClientProvider>,
    );

    expect(await screen.findByText('Mây Nhỏ')).toBeVisible();
    expect(screen.getByText('Mây Nhỏ').closest('a')).toHaveAttribute(
      'href',
      '/users/user-1',
    );
  });
});
