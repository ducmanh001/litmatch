import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import { vi } from 'vitest';

import { MessageList } from './message-list';
import { apiClient, tokenStore } from '../../../shared/api/client';

function mockGet(
  messages: {
    id: string;
    senderUserId: string;
    content: string;
    sentAt: string;
  }[],
) {
  vi.spyOn(apiClient, 'GET').mockImplementation(async (path: string) => {
    if (path === '/api/v1/users/me') {
      return {
        data: { data: { id: 'me-1', nickname: 'Tôi', gender: 'unknown' } },
      } as never;
    }
    if (path === '/api/v1/conversations/{id}/messages') {
      return { data: { data: { items: messages, meta: {} } } } as never;
    }
    throw new Error(`unexpected GET ${path}`);
  });
}

function renderList() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <MessageList conversationId="conv-1" />
    </QueryClientProvider>,
  );
}

describe('MessageList', () => {
  beforeEach(() => {
    tokenStore.setSession({ accessToken: 'a', csrfToken: 'r' });
  });
  afterEach(() => {
    tokenStore.setSession(null);
    vi.restoreAllMocks();
  });

  it('empty — gợi ý bắt đầu trò chuyện', async () => {
    mockGet([]);
    renderList();
    expect(await screen.findByText(/Chưa có tin nhắn nào/)).toBeVisible();
  });

  it('phân biệt bubble của mình và của đối phương theo senderUserId', async () => {
    mockGet([
      {
        id: 'm1',
        senderUserId: 'me-1',
        content: 'Của tôi',
        sentAt: new Date().toISOString(),
      },
      {
        id: 'm2',
        senderUserId: 'partner-1',
        content: 'Của bạn',
        sentAt: new Date().toISOString(),
      },
    ]);
    renderList();

    const mine = await screen.findByText('Của tôi');
    const partner = await screen.findByText('Của bạn');
    expect(mine.className).toContain('bg-primary');
    expect(partner.className).not.toContain('bg-primary');
    expect(mine.className).toContain('[overflow-wrap:anywhere]');
    expect(partner.className).toContain('[overflow-wrap:anywhere]');
  });
});
