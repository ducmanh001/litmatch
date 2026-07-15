import { ApiError } from '@litmatch/api-client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { vi } from 'vitest';

import { ConversationThread } from './conversation-thread';
import { apiClient, tokenStore } from '../../../shared/api/client';
import { ConfirmSheet } from '../../../shared/ui/confirm-sheet';
import { ToastStack } from '../../../shared/ui/toast-stack';

const { routerPush } = vi.hoisted(() => ({ routerPush: vi.fn() }));
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: routerPush }),
}));

function renderThread() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <ConversationThread friendUserId="partner-1" />
      <ToastStack />
      <ConfirmSheet />
    </QueryClientProvider>,
  );
}

function mockPartnerAndConversation(onGet: (path: string) => unknown): void {
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
    return onGet(path);
  });
}

describe('ConversationThread', () => {
  beforeEach(() => tokenStore.setSession({ accessToken: 'a', csrfToken: 'r' }));
  afterEach(() => {
    tokenStore.setSession(null);
    vi.restoreAllMocks();
  });

  it('data — hiển thị tên đối phương + composer', async () => {
    mockPartnerAndConversation((path) => {
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

  it('menu "..." → Chặn người này → confirm danger → gọi Safety block thật + toast + về /friends', async () => {
    mockPartnerAndConversation((path) => {
      throw new Error(`unexpected GET ${path}`);
    });
    const postSpy = vi
      .spyOn(apiClient, 'POST')
      .mockResolvedValue({ data: undefined } as never);

    const user = userEvent.setup();
    renderThread();

    await user.click(
      await screen.findByRole('button', { name: 'Tuỳ chọn cuộc trò chuyện' }),
    );
    await user.click(
      await screen.findByRole('button', { name: '🚫 Chặn người này' }),
    );
    await user.click(await screen.findByRole('button', { name: 'Chặn' }));

    await waitFor(() => {
      expect(postSpy).toHaveBeenCalledWith(
        '/api/v1/safety/blocks/{targetUserId}',
        { params: { path: { targetUserId: 'partner-1' } } },
      );
    });
    expect(await screen.findByText('Đã chặn Bạn B')).toBeVisible();
    expect(routerPush).toHaveBeenCalledWith('/friends');
  });

  it('menu "..." → tắt thông báo → toast, không gọi network nào (client state thuần)', async () => {
    mockPartnerAndConversation((path) => {
      throw new Error(`unexpected GET ${path}`);
    });
    const postSpy = vi.spyOn(apiClient, 'POST');

    const user = userEvent.setup();
    renderThread();

    await user.click(
      await screen.findByRole('button', { name: 'Tuỳ chọn cuộc trò chuyện' }),
    );
    await user.click(
      await screen.findByRole('button', { name: '🔕 Tắt thông báo' }),
    );

    expect(await screen.findByText('Đã tắt thông báo từ Bạn B')).toBeVisible();
    expect(postSpy).not.toHaveBeenCalled();
  });
});
