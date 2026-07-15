import { ApiError } from '@litmatch/api-client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { vi } from 'vitest';

import { FriendPicker } from './friend-picker';
import { apiClient } from '../../../shared/api/client';

import type { MovieSessionDto } from '../api';
import type { FriendOption } from './friend-picker';

const FRIENDS: FriendOption[] = [
  { userId: 'friend-1', nickname: 'Người bạn A' },
  { userId: 'friend-2', nickname: 'Người bạn B' },
];

function renderPicker(props: Partial<Parameters<typeof FriendPicker>[0]> = {}) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  const onCreated = vi.fn();
  render(
    <QueryClientProvider client={queryClient}>
      <FriendPicker
        friends={FRIENDS}
        friendsPending={false}
        friendsError={false}
        onCreated={onCreated}
        {...props}
      />
    </QueryClientProvider>,
  );
  return { onCreated };
}

describe('FriendPicker', () => {
  afterEach(() => vi.restoreAllMocks());

  it('đang tải bạn bè — hiện trạng thái loading', () => {
    renderPicker({ friendsPending: true });
    expect(screen.getByText(/Đang tìm bạn xem cùng/)).toBeVisible();
  });

  it('lỗi tải bạn bè — hiện alert', () => {
    renderPicker({ friendsError: true });
    expect(screen.getByRole('alert')).toHaveTextContent(
      'Không tải được danh sách bạn bè.',
    );
  });

  it('không có bạn bè — gợi ý đi kết bạn, không render form', () => {
    renderPicker({ friends: [] });
    expect(
      screen.getByText(/chưa có ai trong danh sách bạn bè/i),
    ).toBeVisible();
    expect(screen.queryByLabelText('Xem cùng ai?')).not.toBeInTheDocument();
  });

  it('liệt kê đúng danh sách bạn bè trong select', () => {
    renderPicker();
    const select = screen.getByLabelText('Xem cùng ai?');
    expect(select).toBeVisible();
    expect(screen.getByRole('option', { name: 'Người bạn A' })).toBeVisible();
    expect(screen.getByRole('option', { name: 'Người bạn B' })).toBeVisible();
  });

  it('chọn bạn + nhập link, submit thì gọi tạo session và callback onCreated', async () => {
    const session: MovieSessionDto = {
      id: 'session-1',
      partnerUserId: 'friend-1',
      videoUrl: 'https://www.youtube.com/watch?v=abc123',
      positionSeconds: 0,
      isPlaying: false,
      positionUpdatedAt: new Date().toISOString(),
      status: 'active',
      endedAt: null,
      endReason: null,
    };
    const post = vi.spyOn(apiClient, 'POST').mockResolvedValue({
      data: { data: session },
    } as never);

    const { onCreated } = renderPicker();
    const user = userEvent.setup();

    await user.selectOptions(screen.getByLabelText('Xem cùng ai?'), 'friend-1');
    await user.type(
      screen.getByLabelText('Link video YouTube'),
      'https://www.youtube.com/watch?v=abc123',
    );
    await user.click(screen.getByRole('button', { name: 'Bắt đầu xem chung' }));

    await vi.waitFor(() => expect(onCreated).toHaveBeenCalledWith(session));
    expect(post).toHaveBeenCalledWith(
      '/api/v1/movie-match/sessions',
      expect.objectContaining({
        body: {
          friendUserId: 'friend-1',
          videoUrl: 'https://www.youtube.com/watch?v=abc123',
        },
      }),
    );
  });

  it('link không giống YouTube — hiện gợi ý mềm nhưng không chặn submit', async () => {
    vi.spyOn(apiClient, 'POST').mockResolvedValue({
      data: {
        data: {
          id: 's',
          partnerUserId: 'friend-1',
          videoUrl: 'https://example.com/x',
          positionSeconds: 0,
          isPlaying: false,
          positionUpdatedAt: new Date().toISOString(),
          status: 'active',
          endedAt: null,
          endReason: null,
        },
      },
    } as never);
    renderPicker();
    const user = userEvent.setup();

    await user.type(
      screen.getByLabelText('Link video YouTube'),
      'https://example.com/x',
    );

    expect(screen.getByText(/không phải YouTube/)).toBeVisible();
    expect(
      screen.getByRole('button', { name: 'Bắt đầu xem chung' }),
    ).toBeEnabled();
  });

  it('lỗi từ server khi tạo session — hiện message lỗi', async () => {
    vi.spyOn(apiClient, 'POST').mockRejectedValue(
      new ApiError(400, {
        code: 'MOVIE_MATCH_INVALID_URL',
        message: 'Link video không hợp lệ.',
        traceId: 't',
      }),
    );
    renderPicker();
    const user = userEvent.setup();

    await user.selectOptions(screen.getByLabelText('Xem cùng ai?'), 'friend-1');
    await user.type(screen.getByLabelText('Link video YouTube'), 'not-a-url');
    await user.click(screen.getByRole('button', { name: 'Bắt đầu xem chung' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Link video không hợp lệ.',
    );
  });
});
