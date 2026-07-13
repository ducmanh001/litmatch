import { ApiError } from '@litmatch/api-client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import { vi } from 'vitest';

import { FriendsList } from './friends-list';
import { apiClient } from '../../../shared/api/client';

import type { FriendDto } from '../api';

function renderList() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <FriendsList />
    </QueryClientProvider>,
  );
}

describe('FriendsList', () => {
  afterEach(() => vi.restoreAllMocks());

  it('empty — gợi ý tìm ghép đôi', async () => {
    vi.spyOn(apiClient, 'GET').mockResolvedValue({
      data: { data: [] },
    } as never);
    renderList();

    expect(await screen.findByText(/Chưa có bạn bè/)).toBeVisible();
    expect(
      screen.getByRole('link', { name: 'Tìm ghép đôi' }),
    ).toBeInTheDocument();
  });

  it('error — hiển thị message', async () => {
    vi.spyOn(apiClient, 'GET').mockRejectedValue(
      new ApiError(500, { code: 'X', message: 'Lỗi server', traceId: 't' }),
    );
    renderList();

    expect(await screen.findByRole('alert')).toHaveTextContent('Lỗi server');
  });

  it('data — hiển thị danh sách bạn bè, link vào đúng /chat/:id', async () => {
    const friends: FriendDto[] = [
      {
        profile: {
          id: 'u2',
          nickname: 'Bạn B',
          gender: 'unknown',
          avatarId: 'a1',
        },
        conversationId: 'conv-1',
        friendSince: new Date().toISOString(),
        lastMessageAt: new Date().toISOString(),
      },
    ];
    vi.spyOn(apiClient, 'GET').mockResolvedValue({
      data: { data: friends },
    } as never);
    renderList();

    expect(await screen.findByText('Bạn B')).toBeVisible();
    expect(screen.getByRole('link', { name: /Bạn B/ })).toHaveAttribute(
      'href',
      '/chat/u2',
    );
  });
});
