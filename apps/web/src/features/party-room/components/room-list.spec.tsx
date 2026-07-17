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

  it('empty — hiện empty state, không dựng phòng giả', async () => {
    vi.spyOn(apiClient, 'GET').mockResolvedValue({
      data: { data: [], meta: {} },
    } as never);
    renderList();

    expect(await screen.findByText('Không có phòng nào phù hợp')).toBeVisible();
    expect(screen.queryByText(/Tâm sự đêm khuya/)).not.toBeInTheDocument();
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
      category: 'talk',
      memberCount: 3,
      closeReason: null,
      createdAt: new Date().toISOString(),
      hostDisconnectedAt: null,
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

    // Phòng duy nhất vừa nằm ở "Nổi bật lúc này" vừa ở danh sách chính — 2 lần xuất hiện đúng.
    expect(await screen.findAllByText('Phòng vui vẻ')).toHaveLength(2);
    expect(await screen.findAllByText(/Host A/)).not.toHaveLength(0);
    expect(screen.getAllByText(/3 người/).length).toBeGreaterThan(0);
    expect(
      screen.getByRole('link', { name: /Host A Phòng vui vẻ.*3 người/s }),
    ).toHaveAttribute('href', '/party/room-1');
  });

  it('lọc chủ đề gửi category thật lên API', async () => {
    const get = vi.spyOn(apiClient, 'GET').mockResolvedValue({
      data: { data: [], meta: {} },
    } as never);
    renderList();

    await screen.findByText('Không có phòng nào phù hợp');
    screen.getByRole('button', { name: '🎤 Ca hát' }).click();

    await vi.waitFor(() =>
      expect(get).toHaveBeenCalledWith(
        '/api/v1/party/rooms',
        expect.objectContaining({
          params: {
            query: expect.objectContaining({ category: 'sing' }),
          },
        }),
      ),
    );
  });
});
