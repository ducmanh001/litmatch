import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
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
});
