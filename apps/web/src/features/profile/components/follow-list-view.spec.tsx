import { ApiError } from '@litmatch/api-client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { vi } from 'vitest';

import { apiClient, tokenStore } from '../../../shared/api/client';
import { setLocale } from '../../../shared/i18n/locale-store';
import { FollowListView } from './follow-list-view';

import type { FollowListItemDto, FollowListKind } from '../api';

const ME = 'u-me';
const OWNER = 'u-owner';

function item(
  id: string,
  nickname: string,
  isFollowing = false,
): FollowListItemDto {
  return {
    profile: {
      id,
      nickname,
      gender: 'unknown',
      avatarId: 'a1',
      interests: null,
    },
    followedAt: '2026-10-10T03:00:00.000Z',
    isFollowing,
  };
}

function ok(data: unknown) {
  return Promise.resolve({ data: { data } }) as never;
}

type ListPage = {
  items: FollowListItemDto[];
  meta: { nextCursor: string | null };
};

function mockApi(pages: { first: ListPage; second?: ListPage }) {
  return vi.spyOn(apiClient, 'GET').mockImplementation(((
    path: string,
    init?: { params?: { query?: { cursor?: string } } },
  ) => {
    if (path === '/api/v1/users/me') return ok({ id: ME, nickname: 'Tôi' });
    if (path === '/api/v1/profiles/{profileUserId}/follow-counts') {
      return ok({ followerCount: 3, followingCount: 5 });
    }
    if (
      path === '/api/v1/profiles/{profileUserId}/followers' ||
      path === '/api/v1/profiles/{profileUserId}/following'
    ) {
      return ok(
        init?.params?.query?.cursor === undefined ? pages.first : pages.second,
      );
    }
    return ok([]);
  }) as never);
}

function renderView(userId: string, kind: FollowListKind) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <FollowListView userId={userId} kind={kind} />
    </QueryClientProvider>,
  );
}

describe('FollowListView', () => {
  beforeEach(() => {
    tokenStore.setSession({ accessToken: 'a', csrfToken: 'r' });
  });

  afterEach(() => {
    tokenStore.setSession(null);
    setLocale('vi');
    vi.restoreAllMocks();
  });

  it('followers — liệt kê người theo dõi, link sang hồ sơ và số đếm ở tab', async () => {
    mockApi({
      first: {
        items: [item('u-a', 'Mây Hồng'), item('u-b', 'Nắng Mai')],
        meta: { nextCursor: null },
      },
    });
    renderView(OWNER, 'followers');

    expect(await screen.findByText('Mây Hồng')).toBeVisible();
    expect(screen.getByRole('link', { name: /Mây Hồng/ })).toHaveAttribute(
      'href',
      '/users/u-a',
    );
    expect(screen.getByRole('link', { name: /Nắng Mai/ })).toHaveAttribute(
      'href',
      '/users/u-b',
    );
    expect(
      screen.getByRole('heading', { name: 'Người theo dõi' }),
    ).toBeVisible();

    // Tab: active theo kind, đủ số đếm từ follow-counts, link sang danh sách còn lại.
    const followersTab = await screen.findByRole('link', {
      name: /Người theo dõi\s*3/,
    });
    expect(followersTab).toHaveAttribute('aria-current', 'page');
    expect(followersTab).toHaveAttribute('href', '/users/u-owner/followers');
    expect(
      screen.getByRole('link', { name: /Đang theo dõi\s*5/ }),
    ).toHaveAttribute('href', '/users/u-owner/following');
    // Hồ sơ người khác → nút quay lại về public profile của họ.
    expect(
      screen.getByRole('link', { name: 'Quay lại hồ sơ' }),
    ).toHaveAttribute('href', '/users/u-owner');
    expect(screen.queryByRole('button', { name: 'Xem thêm' })).toBeNull();
  });

  it('nút theo dõi lại nằm ngoài link của dòng — bấm gọi follow, không chuyển trang', async () => {
    mockApi({
      first: {
        items: [item('u-a', 'Mây Hồng', false), item('u-b', 'Nắng Mai', true)],
        meta: { nextCursor: null },
      },
    });
    const post = vi.spyOn(apiClient, 'POST').mockResolvedValue({
      data: { data: { following: true } },
    } as never);
    const del = vi.spyOn(apiClient, 'DELETE').mockResolvedValue({
      data: { data: { following: false } },
    } as never);
    renderView(OWNER, 'followers');

    const followBack = await screen.findByRole('button', {
      name: 'Theo dõi lại',
    });
    // Cụm avatar + tên là link sang hồ sơ; nút không nằm trong link đó.
    expect(
      screen.getByRole('link', { name: /Mây Hồng/ }).contains(followBack),
    ).toBe(false);
    const user = userEvent.setup();
    await user.click(followBack);
    expect(post).toHaveBeenCalledWith(
      '/api/v1/profiles/{profileUserId}/follow',
      { params: { path: { profileUserId: 'u-a' } } },
    );

    // Đã theo dõi → nút "Đang theo dõi", bấm để bỏ theo dõi.
    await user.click(screen.getByRole('button', { name: 'Đang theo dõi' }));
    expect(del).toHaveBeenCalledWith(
      '/api/v1/profiles/{profileUserId}/follow',
      { params: { path: { profileUserId: 'u-b' } } },
    );
  });

  it('phân trang — "Xem thêm" nối trang kế bằng nextCursor rồi biến mất khi hết', async () => {
    const get = mockApi({
      first: { items: [item('u-a', 'Mây Hồng')], meta: { nextCursor: 'c1' } },
      second: { items: [item('u-b', 'Nắng Mai')], meta: { nextCursor: null } },
    });
    renderView(OWNER, 'following');

    expect(await screen.findByText('Mây Hồng')).toBeVisible();
    await userEvent
      .setup()
      .click(await screen.findByRole('button', { name: 'Xem thêm' }));

    expect(await screen.findByText('Nắng Mai')).toBeVisible();
    expect(screen.getByText('Mây Hồng')).toBeVisible();
    expect(screen.queryByRole('button', { name: 'Xem thêm' })).toBeNull();
    expect(get).toHaveBeenCalledWith(
      '/api/v1/profiles/{profileUserId}/following',
      expect.objectContaining({
        params: expect.objectContaining({
          query: expect.objectContaining({ cursor: 'c1' }),
        }),
      }),
    );
  });

  it('danh sách của chính mình — back về /profile, dòng của mình gắn nhãn Bạn và link /profile', async () => {
    mockApi({
      first: {
        items: [item(ME, 'Tôi'), item('u-a', 'Mây Hồng')],
        meta: { nextCursor: null },
      },
    });
    renderView(ME, 'followers');

    expect(await screen.findByText('Mây Hồng')).toBeVisible();
    expect(
      screen.getByRole('link', { name: 'Quay lại hồ sơ' }),
    ).toHaveAttribute('href', '/profile');
    expect(await screen.findByText('Bạn')).toBeVisible();
    // Chỉ người khác có nút theo dõi; dòng của chính mình thì không.
    expect(screen.getAllByRole('button', { name: /theo dõi/i })).toHaveLength(
      1,
    );
    expect(screen.getByRole('link', { name: /Tôi\s*Bạn/ })).toHaveAttribute(
      'href',
      '/profile',
    );
  });

  it('rỗng — thông báo theo từng loại danh sách', async () => {
    mockApi({ first: { items: [], meta: { nextCursor: null } } });
    const followers = renderView(OWNER, 'followers');
    expect(await screen.findByText('Chưa có ai theo dõi.')).toBeVisible();
    followers.unmount();

    renderView(OWNER, 'following');
    expect(await screen.findByText('Chưa theo dõi ai.')).toBeVisible();
  });

  it('lỗi — hiển thị message từ envelope', async () => {
    vi.spyOn(apiClient, 'GET').mockRejectedValue(
      new ApiError(404, {
        code: 'PROFILE_SOCIAL_PROFILE_NOT_AVAILABLE',
        message: 'Không tìm thấy hồ sơ',
        traceId: 't',
      }),
    );
    renderView(OWNER, 'followers');

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Không tìm thấy hồ sơ',
    );
  });
});
