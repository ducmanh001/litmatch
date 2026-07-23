import { ApiError } from '@litmatch/api-client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
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

  it('empty — hiển thị hướng dẫn thật, không có hội thoại giả', async () => {
    vi.spyOn(apiClient, 'GET').mockResolvedValue({
      data: { data: [] },
    } as never);
    renderList();

    expect(await screen.findByText('Bạn chưa có kết nối nào')).toBeVisible();
    expect(screen.getByRole('link', { name: 'Ghép đôi' })).toHaveAttribute(
      'href',
      '/matching',
    );
    expect(screen.getByRole('link', { name: 'Quanh đây' })).toHaveAttribute(
      'href',
      '/discovery',
    );
    expect(screen.getAllByRole('link')).toHaveLength(2);
    expect(screen.queryByText(/Dữ liệu minh hoạ/)).not.toBeInTheDocument();
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
        unreadCount: 3,
        lastMessagePreview: 'Hẹn gặp cuối tuần nhé',
        muted: false,
      },
    ];
    vi.spyOn(apiClient, 'GET').mockResolvedValue({
      data: { data: friends },
    } as never);
    renderList();

    expect(await screen.findAllByText('Bạn B')).toHaveLength(2);
    const friendLinks = screen.getAllByRole('link', { name: /Bạn B/ });
    expect(friendLinks).toHaveLength(2);
    for (const link of friendLinks) {
      expect(link).toHaveAttribute('href', '/chat/u2');
    }
    expect(screen.queryByText('Dữ liệu minh hoạ')).not.toBeInTheDocument();
    // Badge unread + preview từ server — không còn chỉ hiện timestamp
    expect(screen.getByLabelText('3 tin nhắn chưa đọc')).toBeVisible();
    expect(screen.getByText('Hẹn gặp cuối tuần nhé')).toBeVisible();
  });

  it('bạn chưa từng nhắn tin — hiện ở avatar list "Bạn bè", không có hội thoại', async () => {
    const friends: FriendDto[] = [
      {
        profile: {
          id: 'u3',
          nickname: 'Bạn Mới',
          gender: 'unknown',
          avatarId: 'a2',
        },
        conversationId: 'conv-2',
        friendSince: new Date().toISOString(),
        lastMessageAt: null,
        unreadCount: 0,
        lastMessagePreview: null,
        muted: false,
      },
    ];
    vi.spyOn(apiClient, 'GET').mockResolvedValue({
      data: { data: friends },
    } as never);
    renderList();

    expect(await screen.findByText('Bạn bè')).toBeVisible();
    expect(await screen.findByText('Bạn Mới')).toBeVisible();
    expect(screen.queryByText('Hội thoại')).not.toBeInTheDocument();
  });

  // it('dialog mode — chọn bạn mở thread trong sheet thay vì điều hướng route', async () => {
  //   const onConversationOpen = vi.fn();
  //   const friends: FriendDto[] = [
  //     {
  //       profile: {
  //         id: 'u4',
  //         nickname: 'Bạn Trong Sheet',
  //         gender: 'unknown',
  //         avatarId: 'a4',
  //       },
  //       conversationId: 'conv-4',
  //       friendSince: new Date().toISOString(),
  //       lastMessageAt: new Date().toISOString(),
  //       unreadCount: 0,
  //       lastMessagePreview: 'Chào bạn',
  //       muted: false,
  //     },
  //   ];
  //   vi.spyOn(apiClient, 'GET').mockResolvedValue({
  //     data: { data: friends },
  //   } as never);
  //   const queryClient = new QueryClient({
  //     defaultOptions: { queries: { retry: false } },
  //   });
  //   render(
  //     <QueryClientProvider client={queryClient}>
  //       <FriendsList onConversationOpen={onConversationOpen} />
  //     </QueryClientProvider>,
  //   );

  //   await userEvent.click(
  //     (await screen.findAllByRole('button', { name: /Bạn Trong Sheet/ }))[0],
  //   );
  //   expect(onConversationOpen).toHaveBeenCalledWith('u4');
  // });
});
