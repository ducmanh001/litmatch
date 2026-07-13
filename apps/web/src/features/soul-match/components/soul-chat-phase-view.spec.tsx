import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import { vi } from 'vitest';

import { SoulChatPhaseView } from './soul-chat-phase-view';
import { apiClient } from '../../../shared/api/client';

import type { SoulSessionViewDto } from '../api';

function sessionFixture(
  overrides: Partial<SoulSessionViewDto>,
): SoulSessionViewDto {
  return {
    sessionId: 'session-1',
    phase: 'chatting',
    chatEndsAt: new Date().toISOString(),
    ratingEndsAt: new Date().toISOString(),
    myVerdict: null,
    matched: false,
    ...overrides,
  };
}

function mockGet(session: SoulSessionViewDto) {
  vi.spyOn(apiClient, 'GET').mockImplementation(async (path: string) => {
    if (path === '/api/v1/soul-match/sessions/{id}') {
      return { data: { data: session } } as never;
    }
    if (path === '/api/v1/soul-match/sessions/{id}/messages') {
      return { data: { data: { items: [], meta: {} } } } as never;
    }
    if (path === '/api/v1/soul-match/sessions/{id}/partner') {
      return {
        data: {
          data: {
            id: 'u2',
            nickname: 'Partner',
            gender: 'unknown',
            avatarId: 'a1',
          },
        },
      } as never;
    }
    throw new Error(`unexpected GET ${path}`);
  });
}

function renderView() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <SoulChatPhaseView sessionId="session-1" />
    </QueryClientProvider>,
  );
}

describe('SoulChatPhaseView', () => {
  afterEach(() => vi.restoreAllMocks());

  it('phase chatting — hiển thị composer và nút đánh giá', async () => {
    mockGet(sessionFixture({ phase: 'chatting' }));
    renderView();

    expect(
      await screen.findByLabelText('Nội dung tin nhắn'),
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Thích' })).toBeInTheDocument();
  });

  it('matched giữa lúc đang chat — hiện thẻ đối phương ngay, không đợi phase closed', async () => {
    mockGet(sessionFixture({ phase: 'chatting', matched: true }));
    renderView();

    expect(
      await screen.findByText('Đã trở thành bạn với Partner'),
    ).toBeVisible();
    // Vẫn còn đang chat — composer không biến mất khi vừa match
    expect(screen.getByLabelText('Nội dung tin nhắn')).toBeInTheDocument();
  });

  it('phase rating — ẩn composer, vẫn còn nút đánh giá', async () => {
    mockGet(sessionFixture({ phase: 'rating' }));
    renderView();

    expect(
      await screen.findByRole('button', { name: 'Thích' }),
    ).toBeInTheDocument();
    expect(
      screen.queryByLabelText('Nội dung tin nhắn'),
    ).not.toBeInTheDocument();
  });

  it('phase closed + matched — hiển thị thẻ đối phương', async () => {
    mockGet(sessionFixture({ phase: 'closed', matched: true }));
    renderView();

    expect(
      await screen.findByText('Đã trở thành bạn với Partner'),
    ).toBeVisible();
  });

  it('phase closed + không matched — hiển thị thông báo không match', async () => {
    mockGet(sessionFixture({ phase: 'closed', matched: false }));
    renderView();

    expect(await screen.findByText(/Không match lần này/)).toBeVisible();
  });
});
