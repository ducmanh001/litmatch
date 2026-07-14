import { ApiError } from '@litmatch/api-client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import { vi } from 'vitest';

import { PartyStage } from './party-stage';
import { apiClient, tokenStore } from '../../../shared/api/client';
import { usePartyRoomMedia } from '../hooks/use-party-room-media';

import type { PartyRoomDetailDto } from '../api';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
}));
vi.mock('../hooks/use-party-room-media', () => ({
  usePartyRoomMedia: vi.fn(),
}));

const mockedUsePartyRoomMedia = vi.mocked(usePartyRoomMedia);

function detailFixture(
  overrides: Partial<PartyRoomDetailDto>,
): PartyRoomDetailDto {
  return {
    room: {
      id: 'room-1',
      hostUserId: 'host-1',
      title: 'Phòng vui vẻ',
      status: 'active',
      speakerLimit: 8,
      closeReason: null,
      createdAt: new Date().toISOString(),
      hostDisconnectedAt: null,
    },
    members: [
      { userId: 'host-1', role: 'host', joinedAt: new Date().toISOString() },
    ],
    ...overrides,
  };
}

function mockGet(detail: PartyRoomDetailDto, meId: string) {
  vi.spyOn(apiClient, 'GET').mockImplementation(async (path: string, opts) => {
    if (path === '/api/v1/users/me') {
      return {
        data: { data: { id: meId, nickname: 'Tôi', gender: 'unknown' } },
      } as never;
    }
    if (path === '/api/v1/party/rooms/{id}') {
      return { data: { data: detail } } as never;
    }
    if (path === '/api/v1/users/{id}') {
      const id = (opts as { params: { path: { id: string } } }).params.path.id;
      return {
        data: {
          data: {
            id,
            nickname: `Nick-${id}`,
            gender: 'unknown',
            avatarId: 'a',
          },
        },
      } as never;
    }
    throw new Error(`unexpected GET ${path}`);
  });
}

function renderStage() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <PartyStage roomId="room-1" />
    </QueryClientProvider>,
  );
}

describe('PartyStage', () => {
  beforeEach(() => tokenStore.setSession({ accessToken: 'a', csrfToken: 'r' }));
  afterEach(() => {
    tokenStore.setSession(null);
    vi.restoreAllMocks();
  });

  it('chưa là member — hiển thị preview + nút tham gia', async () => {
    mockedUsePartyRoomMedia.mockReturnValue({
      connect: vi.fn(),
      disconnect: vi.fn(),
      room: null,
      roomDisconnected: false,
      isConnecting: false,
      error: null,
    } as never);
    mockGet(
      detailFixture({
        members: [
          {
            userId: 'host-1',
            role: 'host',
            joinedAt: new Date().toISOString(),
          },
        ],
      }),
      'me-1',
    );

    renderStage();

    expect(
      await screen.findByRole('button', { name: 'Tham gia phòng' }),
    ).toBeInTheDocument();
  });

  it('đã là member — hiển thị stage với danh sách thành viên', async () => {
    mockedUsePartyRoomMedia.mockReturnValue({
      connect: vi.fn(),
      disconnect: vi.fn(),
      room: null,
      roomDisconnected: false,
      isConnecting: false,
      error: null,
    } as never);
    mockGet(
      detailFixture({
        members: [
          { userId: 'me-1', role: 'host', joinedAt: new Date().toISOString() },
        ],
      }),
      'me-1',
    );

    renderStage();

    expect(
      await screen.findByRole('button', { name: /Rời phòng/ }),
    ).toBeInTheDocument();
  });

  it('host đang trong grace chờ kết nối lại — hiện banner, phòng vẫn dùng được bình thường', async () => {
    mockedUsePartyRoomMedia.mockReturnValue({
      connect: vi.fn(),
      disconnect: vi.fn(),
      room: null,
      roomDisconnected: false,
      isConnecting: false,
      error: null,
    } as never);
    mockGet(
      detailFixture({
        room: {
          id: 'room-1',
          hostUserId: 'host-1',
          title: 'Phòng vui vẻ',
          status: 'active',
          speakerLimit: 8,
          closeReason: null,
          createdAt: new Date().toISOString(),
          hostDisconnectedAt: new Date().toISOString(),
        },
        members: [
          { userId: 'me-1', role: 'host', joinedAt: new Date().toISOString() },
        ],
      }),
      'me-1',
    );

    renderStage();

    expect(await screen.findByText(/Host đang mất kết nối/)).toBeVisible();
    // Phòng vẫn hoạt động bình thường trong lúc chờ — không bị khoá UI
    expect(
      screen.getByRole('button', { name: /Rời phòng/ }),
    ).toBeInTheDocument();
  });

  it('phòng đã đóng — hiển thị lý do + link về danh sách', async () => {
    mockedUsePartyRoomMedia.mockReturnValue({
      connect: vi.fn(),
      disconnect: vi.fn(),
      room: null,
      roomDisconnected: false,
      isConnecting: false,
      error: null,
    } as never);
    mockGet(
      detailFixture({
        room: {
          id: 'room-1',
          hostUserId: 'host-1',
          title: 'Phòng vui vẻ',
          status: 'closed',
          speakerLimit: 8,
          closeReason: 'host_left',
          createdAt: new Date().toISOString(),
          hostDisconnectedAt: null,
        },
      }),
      'me-1',
    );

    renderStage();

    expect(await screen.findByText('Host đã rời phòng')).toBeVisible();
    expect(
      screen.getByRole('link', { name: 'Về danh sách phòng' }),
    ).toHaveAttribute('href', '/party');
  });

  it('mic bị từ chối quyền dù room vẫn kết nối — vẫn hiện banner lỗi + nút Kết nối lại', async () => {
    // room !== null (đã join LiveKit, vẫn nghe được người khác) nhưng publish mic thất bại —
    // trước đây banner chỉ hiện khi `room === null`, nên lỗi mic-only bị nuốt im lặng.
    mockedUsePartyRoomMedia.mockReturnValue({
      connect: vi.fn(),
      disconnect: vi.fn(),
      room: { on: vi.fn(), off: vi.fn() } as never,
      roomDisconnected: false,
      isConnecting: false,
      error: new Error('Permission denied'),
    } as never);
    mockGet(
      detailFixture({
        members: [
          { userId: 'me-1', role: 'host', joinedAt: new Date().toISOString() },
        ],
      }),
      'me-1',
    );

    renderStage();

    expect(await screen.findByText('Có lỗi xảy ra, thử lại.')).toBeVisible();
    expect(
      screen.getByRole('button', { name: 'Kết nối lại' }),
    ).toBeInTheDocument();
  });

  it('connect() lỗi (vd rate limit) — không tự retry vô hạn, hiện nút Kết nối lại', async () => {
    // Gắn error vào state của chính mock ngay khi connect() được gọi — mô phỏng đúng thứ tự
    // thật: REST join xong (fail) TRƯỚC KHI bất kỳ re-render nào khác xảy ra, để không phụ
    // thuộc vào việc canh thời điểm gọi rerender() so với các effect/query bất đồng bộ khác.
    let error: Error | null = null;
    const connect = vi.fn(() => {
      error = new ApiError(429, {
        code: 'PARTY_JOIN_RATE_LIMITED',
        message: 'Vui lòng thử lại sau.',
        traceId: 't-1',
      });
    });
    mockedUsePartyRoomMedia.mockImplementation(() => ({
      connect,
      disconnect: vi.fn(),
      room: null,
      roomDisconnected: false,
      isConnecting: false,
      get error() {
        return error;
      },
    }));
    mockGet(
      detailFixture({
        members: [
          { userId: 'me-1', role: 'host', joinedAt: new Date().toISOString() },
        ],
      }),
      'me-1',
    );

    const queryClient = new QueryClient({
      defaultOptions: {
        queries: { retry: false },
        mutations: { retry: false },
      },
    });
    const { rerender } = render(
      <QueryClientProvider client={queryClient}>
        <PartyStage roomId="room-1" />
      </QueryClientProvider>,
    );

    // Effect tự gọi connect() lần đầu vì đã là member và chưa từng thử — connect() (mock)
    // set error ngay lập tức, mô phỏng REST 429 trả về tức thì.
    await waitFor(() => expect(connect).toHaveBeenCalledTimes(1));

    // Ép re-render (như 1 realtime event/query refetch bất kỳ) — nếu effect không gate theo
    // error, đây chính là chỗ nó gọi lại connect() và lặp vô hạn (bug thật đã bắt được: 1636
    // request join trong ~6s, không backoff, không dừng).
    rerender(
      <QueryClientProvider client={queryClient}>
        <PartyStage roomId="room-1" />
      </QueryClientProvider>,
    );

    expect(await screen.findByText('Vui lòng thử lại sau.')).toBeVisible();
    expect(
      screen.getByRole('button', { name: 'Kết nối lại' }),
    ).toBeInTheDocument();
    // connect() KHÔNG được tự động gọi lại sau khi đã lỗi — chỉ còn cách bấm nút thủ công.
    expect(connect).toHaveBeenCalledTimes(1);
  });
});
