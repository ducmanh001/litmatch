import { ApiError } from '@litmatch/api-client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import { vi } from 'vitest';

import { RoomList } from './room-list';
import { apiClient } from '../../../shared/api/client';

import type { PartyRoomDto } from '../api';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
}));

function renderList() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <RoomList />
    </QueryClientProvider>,
  );
}

describe('RoomList', () => {
  afterEach(() => vi.restoreAllMocks());

  it('empty — gợi ý tạo phòng mới', async () => {
    vi.spyOn(apiClient, 'GET').mockResolvedValue({
      data: { data: [], meta: {} },
    } as never);
    renderList();

    expect(await screen.findByText(/Chưa có phòng nào đang mở/)).toBeVisible();
  });

  it('error — hiển thị message', async () => {
    vi.spyOn(apiClient, 'GET').mockRejectedValue(
      new ApiError(500, { code: 'X', message: 'Lỗi server', traceId: 't' }),
    );
    renderList();

    expect(await screen.findByRole('alert')).toHaveTextContent('Lỗi server');
  });

  it('data — hiển thị phòng + nickname host + tối đa speaker', async () => {
    const room: PartyRoomDto = {
      id: 'room-1',
      hostUserId: 'host-1',
      title: 'Phòng vui vẻ',
      status: 'active',
      speakerLimit: 8,
      closeReason: null,
      createdAt: new Date().toISOString(),
    };
    vi.spyOn(apiClient, 'GET').mockImplementation(async (path: string) => {
      if (path === '/api/v1/party/rooms') {
        return { data: { data: [room], meta: {} } } as never;
      }
      if (path === '/api/v1/users/{id}') {
        return {
          data: {
            data: {
              id: 'host-1',
              nickname: 'Host A',
              gender: 'unknown',
              avatarId: 'a',
            },
          },
        } as never;
      }
      throw new Error(`unexpected GET ${path}`);
    });

    renderList();

    expect(await screen.findByText('Phòng vui vẻ')).toBeVisible();
    expect(await screen.findByText(/Host A/)).toBeVisible();
    expect(screen.getByText(/Tối đa 8 người nói/)).toBeVisible();
    expect(screen.getByRole('link', { name: /Phòng vui vẻ/ })).toHaveAttribute(
      'href',
      '/party/room-1',
    );
  });
});
