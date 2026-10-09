import { ApiError } from '@litmatch/api-client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { vi } from 'vitest';

import { apiClient, tokenStore } from '../../../shared/api/client';
import { FriendsDirectory } from './friends-directory';

import type { FriendConnectionDto, FriendDto } from '../api';

const routerPush = vi.fn();
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: routerPush }),
}));

function profile(id: string, nickname: string) {
  return {
    id,
    nickname,
    gender: 'unknown' as const,
    avatarId: 'a1',
    interests: null,
  };
}

function connection(
  id: string,
  nickname: string,
  overrides: Partial<FriendConnectionDto> = {},
): FriendConnectionDto {
  return {
    profile: profile(id, nickname),
    isFriend: true,
    isMutualFollow: false,
    since: '2026-10-01T00:00:00.000Z',
    ...overrides,
  };
}

function inboxEntry(id: string, unreadCount: number): FriendDto {
  return {
    profile: profile(id, `Hội thoại ${id}`),
    conversationId: `conv-${id}`,
    friendSince: '2026-10-01T00:00:00.000Z',
    lastMessageAt: null,
    unreadCount,
    lastMessagePreview: null,
    muted: false,
    isFriend: false,
    canCall: false,
  };
}

function mockApi(connections: FriendConnectionDto[], inbox: FriendDto[] = []) {
  vi.spyOn(apiClient, 'GET').mockImplementation(((path: string) => {
    if (path === '/api/v1/users/me') {
      return Promise.resolve({ data: { data: { id: 'u-me' } } });
    }
    if (path === '/api/v1/friends/connections') {
      return Promise.resolve({ data: { data: connections } });
    }
    return Promise.resolve({ data: { data: inbox } });
  }) as never);
}

function renderDirectory() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <FriendsDirectory />
    </QueryClientProvider>,
  );
}

describe('FriendsDirectory', () => {
  beforeEach(() => {
    tokenStore.setSession({ accessToken: 'a', csrfToken: 'r' });
    routerPush.mockClear();
  });

  afterEach(() => {
    tokenStore.setSession(null);
    vi.restoreAllMocks();
  });

  it('liệt kê bạn bè qua ghép đôi lẫn follow chéo, ghi rõ nguồn kết nối', async () => {
    mockApi([
      connection('u-1', 'Bạn Ghép Đôi'),
      connection('u-2', 'Bạn Follow Chéo', {
        isFriend: false,
        isMutualFollow: true,
      }),
    ]);
    renderDirectory();

    expect(await screen.findByText('Bạn Ghép Đôi')).toBeVisible();
    expect(screen.getByText('Bạn Follow Chéo')).toBeVisible();
    expect(screen.getByText('2 người bạn')).toBeVisible();
    expect(screen.getByText('Kết bạn qua ghép đôi')).toBeVisible();
    expect(screen.getByText('Theo dõi nhau')).toBeVisible();
    expect(
      screen.getByRole('link', { name: 'Xem hồ sơ Bạn Follow Chéo' }),
    ).toHaveAttribute('href', '/users/u-2');
  });

  it('nhắn tin — mở conversation rồi vào /chat/:id (bạn follow chéo có thể chưa từng chat)', async () => {
    mockApi([
      connection('u-2', 'Bạn Follow Chéo', {
        isFriend: false,
        isMutualFollow: true,
      }),
    ]);
    const post = vi.spyOn(apiClient, 'POST').mockResolvedValue({
      data: { data: { id: 'conv-new' } },
    } as never);
    renderDirectory();

    await userEvent.setup().click(
      await screen.findByRole('button', {
        name: 'Nhắn tin cho Bạn Follow Chéo',
      }),
    );

    expect(post).toHaveBeenCalledWith(
      '/api/v1/profiles/{profileUserId}/conversation',
      { params: { path: { profileUserId: 'u-2' } } },
    );
    await vi.waitFor(() =>
      expect(routerPush).toHaveBeenCalledWith('/chat/u-2'),
    );
  });

  it('nhắn tin bị yêu cầu tặng quà (402) — chuyển sang hồ sơ để tặng quà', async () => {
    mockApi([connection('u-2', 'Bạn Hot')]);
    vi.spyOn(apiClient, 'POST').mockRejectedValue(
      new ApiError(402, {
        code: 'PROFILE_SOCIAL_MESSAGE_GIFT_REQUIRED',
        message: 'Hãy tặng một món quà để mở chat',
        traceId: 't',
      }),
    );
    renderDirectory();

    await userEvent
      .setup()
      .click(
        await screen.findByRole('button', { name: 'Nhắn tin cho Bạn Hot' }),
      );

    await vi.waitFor(() =>
      expect(routerPush).toHaveBeenCalledWith('/users/u-2'),
    );
  });

  it('lối tắt — Tin nhắn kèm số chưa đọc của inbox, follower/following của chính mình', async () => {
    mockApi(
      [connection('u-1', 'Bạn Một')],
      [inboxEntry('u-9', 2), inboxEntry('u-8', 3)],
    );
    renderDirectory();

    const messages = await screen.findByRole('link', { name: /Tin nhắn/ });
    expect(messages).toHaveAttribute('href', '/messages');
    expect(await within(messages).findByText('5')).toBeVisible();
    expect(
      await screen.findByRole('link', { name: 'Người theo dõi' }),
    ).toHaveAttribute('href', '/users/u-me/followers');
    expect(screen.getByRole('link', { name: 'Đang theo dõi' })).toHaveAttribute(
      'href',
      '/users/u-me/following',
    );
  });

  it('chưa có bạn bè — hướng dẫn cách kết bạn, dù đã có hội thoại khác', async () => {
    mockApi([], [inboxEntry('u-9', 0)]);
    renderDirectory();

    expect(await screen.findByText('Bạn chưa có người bạn nào')).toBeVisible();
    expect(screen.getByRole('link', { name: 'Ghép đôi' })).toHaveAttribute(
      'href',
      '/matching',
    );
    expect(screen.queryByText('Hội thoại u-9')).not.toBeInTheDocument();
  });

  it('lỗi — hiển thị message', async () => {
    vi.spyOn(apiClient, 'GET').mockRejectedValue(
      new ApiError(500, { code: 'X', message: 'Lỗi server', traceId: 't' }),
    );
    renderDirectory();

    expect(await screen.findByRole('alert')).toHaveTextContent('Lỗi server');
  });
});
