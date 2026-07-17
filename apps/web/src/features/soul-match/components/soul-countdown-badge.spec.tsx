import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import { vi } from 'vitest';

import { SoulCountdownBadge } from './soul-countdown-badge';
import { apiClient } from '../../../shared/api/client';

import type { SoulSessionViewDto } from '../api';

function mockGet(session: SoulSessionViewDto) {
  vi.spyOn(apiClient, 'GET').mockImplementation(async (path: string) => {
    if (path === '/api/v1/soul-match/sessions/{id}') {
      return { data: { data: session } } as never;
    }
    throw new Error(`unexpected GET ${path}`);
  });
}

function renderBadge() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <SoulCountdownBadge sessionId="session-1" />
    </QueryClientProvider>,
  );
}

describe('SoulCountdownBadge', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('phase chatting — đếm ngược thật theo chatEndsAt', async () => {
    mockGet({
      sessionId: 'session-1',
      phase: 'chatting',
      chatEndsAt: new Date(Date.now() + 150_000).toISOString(),
      ratingEndsAt: new Date(Date.now() + 300_000).toISOString(),
      myVerdict: null,
      matched: false,
    });
    renderBadge();

    expect(await screen.findByText(/^2:(29|30)$/)).toBeVisible();
  });

  it('phase closed — không có deadline, chỉ giữ chỗ trống', async () => {
    mockGet({
      sessionId: 'session-1',
      phase: 'closed',
      chatEndsAt: new Date().toISOString(),
      ratingEndsAt: new Date().toISOString(),
      myVerdict: 'like',
      matched: false,
    });
    renderBadge();

    expect(await screen.findByTestId('countdown-spacer')).toBeInTheDocument();
  });
});
