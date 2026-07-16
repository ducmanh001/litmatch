import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { vi } from 'vitest';

import { PalmReadingView } from './palm-reading-view';
import { apiClient } from '../../../shared/api/client';

import type { PalmMatchStateDto } from '../api';

const push = vi.fn();
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push }),
}));

const SESSION_ID = '11111111-1111-4111-8111-111111111111';

function stateFixture(
  overrides: Partial<PalmMatchStateDto> = {},
): PalmMatchStateDto {
  return {
    state: 'active',
    sessionId: SESSION_ID,
    expiresAt: new Date(Date.now() + 300_000).toISOString(),
    myFlipped: false,
    opponentFlipped: false,
    ...overrides,
  };
}

function mockServer(initial: PalmMatchStateDto) {
  let serverState = initial;
  const get = vi.spyOn(apiClient, 'GET').mockImplementation(
    async () =>
      ({
        data: { data: serverState },
      }) as never,
  );
  const post = vi
    .spyOn(apiClient, 'POST')
    .mockImplementation(async (path: string, options?: unknown) => {
      if (path === '/api/v1/palm-match/sessions/{id}/flip') {
        serverState = stateFixture({
          myFlipped: true,
          mySign: { key: 'aries', symbol: '♈', name: 'Bạch Dương' },
        });
      } else if (path === '/api/v1/palm-match/sessions/{id}/rating') {
        const rating = (options as { body: { rating: 'like' | 'skip' } }).body
          .rating;
        serverState =
          rating === 'like'
            ? stateFixture({
                myFlipped: true,
                opponentFlipped: true,
                myRating: 'like',
                mySign: {
                  key: 'aries',
                  symbol: '♈',
                  name: 'Bạch Dương',
                },
                opponentSign: {
                  key: 'libra',
                  symbol: '♎',
                  name: 'Thiên Bình',
                },
                compatibilityPercent: 88,
                fortune: 'Một kết quả được chốt từ server.',
              })
            : stateFixture({
                state: 'completed',
                outcome: 'not_matched',
              });
      }
      return { data: { data: serverState } } as never;
    });
  const remove = vi.spyOn(apiClient, 'DELETE').mockImplementation(async () => {
    serverState = { state: 'idle' };
    return { data: { data: serverState } } as never;
  });
  return { get, post, remove };
}

function renderView() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <PalmReadingView />
    </QueryClientProvider>,
  );
}

describe('PalmReadingView', () => {
  afterEach(() => {
    push.mockReset();
    vi.restoreAllMocks();
  });

  it('render queue server và chỉ về home sau khi DELETE current thành công', async () => {
    const api = mockServer({
      state: 'queued',
      queuedAt: new Date().toISOString(),
    });
    renderView();
    const user = userEvent.setup();

    await user.click(
      await screen.findByRole('button', { name: 'Huỷ tìm kiếm' }),
    );

    await waitFor(() => expect(api.remove).toHaveBeenCalledTimes(1));
    expect(push).toHaveBeenCalledWith('/home');
  });

  it('participant chỉ lật được lá của mình; kết quả lá lấy từ response server', async () => {
    const api = mockServer(stateFixture());
    renderView();
    const user = userEvent.setup();

    const myCard = await screen.findByRole('button', {
      name: 'Lật bài của bạn',
    });
    expect(
      screen.getByRole('button', { name: 'Bài của người ấy' }),
    ).toBeDisabled();
    await user.click(myCard);

    await waitFor(() =>
      expect(api.post).toHaveBeenCalledWith(
        '/api/v1/palm-match/sessions/{id}/flip',
        { params: { path: { id: SESSION_ID } } },
      ),
    );
    expect(
      await screen.findByText('Đã lật bài — đang chờ người ấy ✨'),
    ).toBeVisible();
  });

  it('chỉ sau hai flip mới xem %/fortune và gửi rating thật', async () => {
    const api = mockServer(
      stateFixture({
        myFlipped: true,
        opponentFlipped: true,
        mySign: { key: 'aries', symbol: '♈', name: 'Bạch Dương' },
        opponentSign: { key: 'libra', symbol: '♎', name: 'Thiên Bình' },
        compatibilityPercent: 88,
        fortune: 'Một kết quả được chốt từ server.',
      }),
    );
    renderView();
    const user = userEvent.setup();

    await user.click(
      await screen.findByRole('button', { name: 'Xem duyên số' }),
    );
    expect(screen.getByText('88%')).toBeVisible();
    expect(screen.getByText(/Một kết quả được chốt từ server/)).toBeVisible();
    await user.click(screen.getByRole('button', { name: /Thích/ }));

    await waitFor(() =>
      expect(api.post).toHaveBeenCalledWith(
        '/api/v1/palm-match/sessions/{id}/rating',
        {
          params: { path: { id: SESSION_ID } },
          body: { rating: 'like' },
        },
      ),
    );
    expect(await screen.findByText('Đã gửi lượt thích')).toBeVisible();
  });

  it('mutual-like terminal mới render link hồ sơ thật của partner', async () => {
    mockServer(
      stateFixture({
        state: 'completed',
        outcome: 'matched',
        partnerUserId: '22222222-2222-4222-8222-222222222222',
      }),
    );
    renderView();

    expect(
      await screen.findByRole('link', { name: 'Xem hồ sơ và nhắn tin' }),
    ).toHaveAttribute('href', '/users/22222222-2222-4222-8222-222222222222');
  });
});
