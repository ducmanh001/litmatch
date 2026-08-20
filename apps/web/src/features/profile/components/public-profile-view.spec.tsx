import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { vi } from 'vitest';

import { apiClient, tokenStore } from '../../../shared/api/client';
import { setLocale } from '../../../shared/i18n/locale-store';
import { PublicProfileView } from './public-profile-view';

import type { PostDto } from '../../feed/api';
import type { PublicProfileDto } from '../api';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn() }),
}));

const profile: PublicProfileDto = {
  id: 'u-public',
  nickname: 'Mây Hồng',
  gender: 'female',
  avatarId: 'avatar-1',
  interests: ['Âm nhạc', 'Du lịch'],
};

const post: PostDto = {
  id: 'post-1',
  authorUserId: profile.id,
  author: profile,
  content: 'Một ngày thật đẹp để bắt đầu một câu chuyện mới.',
  imageUrl: null,
  audience: 'public',
  likeCount: 4,
  commentCount: 3,
  createdAt: '2026-08-20T08:00:00.000Z',
};

function renderView() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });

  return render(
    <QueryClientProvider client={queryClient}>
      <PublicProfileView userId={profile.id} />
    </QueryClientProvider>,
  );
}

function mockPublicProfile(
  actions: {
    isFollowing: boolean;
    followerCount: number;
    followingCount: number;
    conversationId: string | null;
    messageAvailable: boolean;
    requiresGift: boolean;
    dailyFirstChatCount: number;
    firstChatThreshold: number;
  },
  posts: PostDto[] = [],
) {
  vi.spyOn(apiClient, 'GET').mockImplementation((path) => {
    if (path === '/api/v1/users/{id}') {
      return Promise.resolve({ data: { data: profile } }) as never;
    }
    if (path === '/api/v1/users/{id}/presence') {
      return Promise.resolve({ data: { data: { isOnline: true } } }) as never;
    }
    if (path === '/api/v1/profiles/{profileUserId}/actions') {
      return Promise.resolve({ data: { data: actions } }) as never;
    }
    if (path === '/api/v1/feed/users/{userId}/posts') {
      return Promise.resolve({
        data: { data: { items: posts, nextCursor: null } },
      }) as never;
    }
    return Promise.resolve({ data: { data: [] } }) as never;
  });
}

describe('PublicProfileView', () => {
  beforeEach(() => {
    tokenStore.setSession({ accessToken: 'a', csrfToken: 'r' });
  });

  afterEach(() => {
    tokenStore.setSession(null);
    setLocale('vi');
    vi.restoreAllMocks();
  });

  it('hiển thị đầy đủ profile và bỏ các nút match cũ', async () => {
    mockPublicProfile(
      {
        isFollowing: false,
        followerCount: 12,
        followingCount: 7,
        conversationId: null,
        messageAvailable: false,
        requiresGift: false,
        dailyFirstChatCount: 0,
        firstChatThreshold: 2,
      },
      [post],
    );
    renderView();

    expect(await screen.findByText('Mây Hồng')).toBeVisible();
    expect(screen.getAllByText('Nữ')).toHaveLength(2);
    expect(screen.getByText('Âm nhạc')).toBeVisible();
    expect(screen.getByText('Du lịch')).toBeVisible();
    expect(screen.getByText('12')).toBeVisible();
    expect(screen.getByText('Người theo dõi')).toBeVisible();
    expect(screen.getByText('7')).toBeVisible();
    expect(
      await screen.findByText(
        'Một ngày thật đẹp để bắt đầu một câu chuyện mới.',
      ),
    ).toBeVisible();
    expect(screen.getByText('Công khai')).toBeVisible();
    expect(
      screen.queryByRole('button', { name: /Voice Match/i }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: /Soul Match/i }),
    ).not.toBeInTheDocument();
  });

  it('không gọi mở chat khi server yêu cầu tặng quà', async () => {
    mockPublicProfile({
      isFollowing: false,
      followerCount: 12,
      followingCount: 7,
      conversationId: null,
      messageAvailable: false,
      requiresGift: true,
      dailyFirstChatCount: 2,
      firstChatThreshold: 2,
    });
    const post = vi.spyOn(apiClient, 'POST').mockResolvedValue({
      data: { data: { following: true } },
    } as never);
    renderView();

    const messageButton = await screen.findByRole('button', {
      name: 'Tặng quà để chat',
    });
    expect(messageButton).toBeDisabled();
    expect(screen.getByText('Mở khóa cuộc trò chuyện')).toBeVisible();

    await userEvent
      .setup()
      .click(screen.getByRole('button', { name: '♡ Theo dõi' }));
    expect(post).toHaveBeenCalledWith(
      '/api/v1/profiles/{profileUserId}/follow',
      { params: { path: { profileUserId: profile.id } } },
    );
    expect(post).not.toHaveBeenCalledWith(
      '/api/v1/profiles/{profileUserId}/conversation',
      expect.anything(),
    );
  });
});
