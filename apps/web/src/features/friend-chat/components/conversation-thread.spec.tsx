import { ApiError } from '@litmatch/api-client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import { vi } from 'vitest';

import { ConversationThread } from './conversation-thread';
import { apiClient, tokenStore } from '../../../shared/api/client';

function renderThread() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <ConversationThread friendUserId="partner-1" />
    </QueryClientProvider>,
  );
}

describe('ConversationThread', () => {
  beforeEach(() => tokenStore.setSession({ accessToken: 'a', csrfToken: 'r' }));
  afterEach(() => {
    tokenStore.setSession(null);
    vi.restoreAllMocks();
  });

  it('data — hiển thị tên đối phương + composer', async () => {
    vi.spyOn(apiClient, 'GET').mockImplementation(async (path: string) => {
      if (path === '/api/v1/users/me') {
        return {
          data: { data: { id: 'me-1', nickname: 'Tôi', gender: 'unknown' } },
        } as never;
      }
      if (path === '/api/v1/users/{id}') {
        return {
          data: {
            data: {
              id: 'partner-1',
              nickname: 'Bạn B',
              gender: 'unknown',
              avatarId: 'a1',
            },
          },
        } as never;
      }
      if (path === '/api/v1/friends/{friendUserId}/conversation') {
        return { data: { data: { id: 'conv-1' } } } as never;
      }
      if (path === '/api/v1/conversations/{id}/messages') {
        return { data: { data: { items: [], meta: {} } } } as never;
      }
      throw new Error(`unexpected GET ${path}`);
    });

    renderThread();

    expect(await screen.findByRole('heading', { name: 'Bạn B' })).toBeVisible();
    expect(screen.getByLabelText('Nội dung tin nhắn')).toBeInTheDocument();
  });

  it('404 — chưa là bạn bè hoặc không tồn tại, hiện message lỗi', async () => {
    vi.spyOn(apiClient, 'GET').mockImplementation(async (path: string) => {
      if (path === '/api/v1/users/me') {
        return {
          data: { data: { id: 'me-1', nickname: 'Tôi', gender: 'unknown' } },
        } as never;
      }
      if (path === '/api/v1/users/{id}') {
        return {
          data: {
            data: {
              id: 'partner-1',
              nickname: 'Bạn B',
              gender: 'unknown',
              avatarId: 'a1',
            },
          },
        } as never;
      }
      if (path === '/api/v1/friends/{friendUserId}/conversation') {
        throw new ApiError(404, {
          code: 'FRIEND_NOT_FOUND',
          message: 'Không tìm thấy cuộc trò chuyện',
          traceId: 't1',
        });
      }
      throw new Error(`unexpected GET ${path}`);
    });

    renderThread();

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Không tìm thấy cuộc trò chuyện',
    );
  });
});
