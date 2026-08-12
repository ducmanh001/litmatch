import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import { vi } from 'vitest';

import { PartyChat } from './party-chat';
import { apiClient, tokenStore } from '../../../shared/api/client';

import type { PartyRoomMemberDto } from '../api';

function mockComments(
  items: {
    id: string;
    senderUserId: string;
    content: string;
    sentAt: string;
  }[],
) {
  vi.spyOn(apiClient, 'GET').mockImplementation(async (path: string) => {
    if (path === '/api/v1/party/rooms/{id}/comments') {
      return {
        data: { data: { items, meta: { nextCursor: null } } },
      } as never;
    }
    throw new Error(`unexpected GET ${path}`);
  });
}

function member(userId: string, nickname: string): PartyRoomMemberDto {
  return {
    userId,
    nickname,
    role: userId === 'user-1' ? 'host' : 'audience',
    joinedAt: new Date().toISOString(),
    disconnectedAt: null,
    speakerInvitePending: false,
  };
}

function renderChat(
  comments: {
    id: string;
    senderUserId: string;
    content: string;
    sentAt: string;
  }[],
  members: PartyRoomMemberDto[],
) {
  mockComments(comments);
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });

  return render(
    <QueryClientProvider client={queryClient}>
      <PartyChat roomId="room-1" members={members} currentUserId="user-1" />
    </QueryClientProvider>,
  );
}

describe('PartyChat', () => {
  beforeEach(() => {
    tokenStore.setSession({ accessToken: 'a', csrfToken: 'r' });
  });

  afterEach(() => {
    tokenStore.setSession(null);
    vi.restoreAllMocks();
  });

  it('giữ danh sách bình luận trong vùng cuộn cố định khi phòng có nhiều người chat', async () => {
    const members = Array.from({ length: 8 }, (_, index) =>
      member(`user-${index + 1}`, `Người ${index + 1}`),
    );
    const comments = members.map((roomMember, index) => ({
      id: `comment-${index + 1}`,
      senderUserId: roomMember.userId,
      content: `Tin nhắn của ${roomMember.nickname}`,
      sentAt: new Date(Date.now() + index * 1000).toISOString(),
    }));

    renderChat(comments, members);

    expect(await screen.findByText('Tin nhắn của Người 8')).toBeVisible();
    const list = screen.getByLabelText('Bình luận trong phòng');
    expect(list).toHaveClass('max-h-72', 'overflow-y-auto');
    expect(screen.getByText('8 người')).toBeVisible();
    expect(screen.getAllByRole('listitem')).toHaveLength(8);
  });

  it('phân cấp người gửi, vai trò và composer gọn trong footer', async () => {
    renderChat(
      [
        {
          id: 'comment-1',
          senderUserId: 'user-1',
          content: 'Mình đang nghe đây',
          sentAt: new Date().toISOString(),
        },
        {
          id: 'comment-2',
          senderUserId: 'user-2',
          content: 'Chào bạn nha',
          sentAt: new Date().toISOString(),
        },
      ],
      [member('user-1', 'Chủ phòng'), member('user-2', 'Mây Nhỏ')],
    );

    expect(await screen.findByText('Bạn')).toBeVisible();
    expect(screen.getByText('Host')).toBeVisible();
    expect(screen.getByText('Mây Nhỏ')).toBeVisible();
    expect(
      screen.getByRole('textbox', { name: 'Nội dung bình luận' }),
    ).toHaveAttribute('placeholder', 'Nói gì đó với mọi người…');
    expect(
      screen.getByRole('button', { name: 'Gửi bình luận' }),
    ).toBeDisabled();
  });
});
