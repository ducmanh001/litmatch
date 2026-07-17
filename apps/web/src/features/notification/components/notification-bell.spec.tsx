import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { vi } from 'vitest';

import { NotificationBell } from './notification-bell';
import { apiClient } from '../../../shared/api/client';

const { routerPush } = vi.hoisted(() => ({ routerPush: vi.fn() }));
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: routerPush }),
}));

function renderBell() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <NotificationBell />
    </QueryClientProvider>,
  );
}

function mockGet(options: {
  count: number;
  items: Array<Record<string, unknown>>;
}) {
  vi.spyOn(apiClient, 'GET').mockImplementation(async (path: string) => {
    if (path === '/api/v1/notifications/unread-count') {
      return { data: { data: { count: options.count } } } as never;
    }
    return {
      data: { data: { items: options.items, nextCursor: null } },
    } as never;
  });
}

describe('NotificationBell', () => {
  afterEach(() => vi.restoreAllMocks());

  it('hiện badge khi có thông báo chưa đọc', async () => {
    mockGet({ count: 3, items: [] });
    renderBell();
    expect(
      await screen.findByRole('button', { name: 'Thông báo, 3 chưa đọc' }),
    ).toBeInTheDocument();
  });

  it('mở panel: danh sách rỗng hiện empty state, không tải trước khi mở', async () => {
    mockGet({ count: 0, items: [] });
    renderBell();

    expect(screen.queryByText('Chưa có thông báo nào.')).toBeNull();
    await userEvent.click(
      await screen.findByRole('button', { name: 'Thông báo' }),
    );
    expect(
      await screen.findByText('Chưa có thông báo nào.'),
    ).toBeInTheDocument();
  });

  it('bấm thông báo chưa đọc → POST mark-read rồi điều hướng theo type', async () => {
    mockGet({
      count: 1,
      items: [
        {
          id: 'n-1',
          type: 'post_liked',
          payload: { postId: 'p-9' },
          readAt: null,
          createdAt: new Date().toISOString(),
        },
      ],
    });
    const postSpy = vi.spyOn(apiClient, 'POST').mockResolvedValue({
      data: { data: { id: 'n-1' } },
    } as never);

    renderBell();
    await userEvent.click(
      await screen.findByRole('button', { name: 'Thông báo, 1 chưa đọc' }),
    );
    await userEvent.click(
      await screen.findByText('Có người thích bài viết của bạn'),
    );

    expect(postSpy).toHaveBeenCalledWith(
      '/api/v1/notifications/{notificationId}/read',
      { params: { path: { notificationId: 'n-1' } } },
    );
    expect(routerPush).toHaveBeenCalledWith('/feed/p-9');
  });
});
