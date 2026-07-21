import { ApiError } from '@litmatch/api-client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import { StrictMode } from 'react';
import { vi } from 'vitest';

import { VoiceCallRoom } from './voice-call-room';
import { apiClient } from '../../../shared/api/client';
import { useCallRoom } from '../hooks/use-call-room';

vi.mock('../hooks/use-call-room', () => ({ useCallRoom: vi.fn() }));

const { routerReplace } = vi.hoisted(() => ({ routerReplace: vi.fn() }));
vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: routerReplace }),
}));

const mockedUseCallRoom = vi.mocked(useCallRoom);

function renderRoom() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <VoiceCallRoom matchSessionId="session-1" />
    </QueryClientProvider>,
  );
}

describe('VoiceCallRoom', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    routerReplace.mockReset();
  });

  it('idle — tự kết nối ngay, không dựng bước bấm bắt đầu dư thừa', () => {
    const connect = vi.fn();
    mockedUseCallRoom.mockReturnValue({
      connect,
      room: null,
      callId: null,
      roomDisconnected: false,
      isConnecting: false,
      error: null,
    } as never);

    renderRoom();

    expect(connect).toHaveBeenCalledTimes(1);
    expect(
      screen.queryByRole('button', { name: 'Bắt đầu cuộc gọi' }),
    ).not.toBeInTheDocument();
  });

  it('connecting — hiển thị trạng thái đang kết nối', () => {
    mockedUseCallRoom.mockReturnValue({
      connect: vi.fn(),
      room: null,
      callId: null,
      roomDisconnected: false,
      isConnecting: true,
      error: null,
    } as never);

    renderRoom();

    expect(screen.getByText('Đang kết nối cuộc gọi…')).toBeVisible();
  });

  it('Strict Mode không kết thúc Voice Match ngay sau khi vừa mount', async () => {
    mockedUseCallRoom.mockReturnValue({
      connect: vi.fn(),
      room: null,
      callId: null,
      roomDisconnected: false,
      isConnecting: true,
      error: null,
    } as never);
    const post = vi.spyOn(apiClient, 'POST').mockResolvedValue({} as never);
    const queryClient = new QueryClient({
      defaultOptions: { mutations: { retry: false } },
    });

    render(
      <StrictMode>
        <QueryClientProvider client={queryClient}>
          <VoiceCallRoom matchSessionId="session-1" />
        </QueryClientProvider>
      </StrictMode>,
    );

    expect(post).not.toHaveBeenCalledWith(
      '/api/v1/calling/match-sessions/{matchSessionId}/end',
      expect.anything(),
    );
  });

  it('pagehide kết thúc Voice Match khi người dùng đóng hoặc reload trang', async () => {
    mockedUseCallRoom.mockReturnValue({
      connect: vi.fn(),
      room: null,
      callId: null,
      roomDisconnected: false,
      isConnecting: false,
      error: null,
    } as never);
    const post = vi.spyOn(apiClient, 'POST').mockResolvedValue({} as never);

    renderRoom();
    window.dispatchEvent(new Event('pagehide'));

    await waitFor(() =>
      expect(post).toHaveBeenCalledWith(
        '/api/v1/calling/match-sessions/{matchSessionId}/end',
        { params: { path: { matchSessionId: 'session-1' } } },
      ),
    );
  });

  it('error — hiển thị message từ ApiError', () => {
    mockedUseCallRoom.mockReturnValue({
      connect: vi.fn(),
      room: null,
      callId: null,
      roomDisconnected: false,
      isConnecting: false,
      error: new ApiError(429, {
        code: 'CALLING_RATE_LIMITED',
        message: 'Thử lại sau',
        traceId: 't1',
      }),
    } as never);

    renderRoom();

    expect(screen.getByRole('alert')).toHaveTextContent('Thử lại sau');
  });

  it('connected — hiển thị nút tắt mic và kết thúc', () => {
    mockedUseCallRoom.mockReturnValue({
      connect: vi.fn(),
      room: {
        on: vi.fn(),
        off: vi.fn(),
        localParticipant: { setMicrophoneEnabled: vi.fn() },
      },
      callId: 'call-1',
      roomDisconnected: false,
      isConnecting: false,
      error: null,
    } as never);
    vi.spyOn(apiClient, 'GET').mockResolvedValue({
      data: {
        data: {
          id: 'call-1',
          matchSessionId: 'session-1',
          status: 'active',
          startedAt: new Date().toISOString(),
          endedAt: null,
          endReason: null,
          durationSeconds: null,
          billedMinutes: 0,
          freeCallEndsAt: new Date(Date.now() + 420_000).toISOString(),
        },
      },
    } as never);

    renderRoom();

    expect(screen.getByRole('button', { name: 'Tắt mic' })).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Kết thúc' }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Yêu thích để thành Litfriend' }),
    ).toBeInTheDocument();
  });

  it('connected — chỉ hiển thị countdown 7 phút, không hiển thị thời lượng đã nói', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const startedAt = new Date();
    mockedUseCallRoom.mockReturnValue({
      connect: vi.fn(),
      room: {
        on: vi.fn(),
        off: vi.fn(),
        localParticipant: { setMicrophoneEnabled: vi.fn() },
      },
      callId: 'call-1',
      roomDisconnected: false,
      isConnecting: false,
      error: null,
    } as never);
    vi.spyOn(apiClient, 'GET').mockResolvedValue({
      data: {
        data: {
          id: 'call-1',
          matchSessionId: 'session-1',
          status: 'active',
          startedAt: startedAt.toISOString(),
          endedAt: null,
          endReason: null,
          durationSeconds: null,
          billedMinutes: 0,
          freeCallEndsAt: new Date(startedAt.getTime() + 420_000).toISOString(),
        },
      },
    } as never);

    renderRoom();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });

    expect(await screen.findByText('Còn 7:00 cho phiên này')).toBeVisible();

    for (let i = 0; i < 5; i += 1) {
      await act(async () => {
        await vi.advanceTimersByTimeAsync(1000);
      });
    }

    expect(await screen.findByText('Còn 6:55 cho phiên này')).toBeVisible();
    expect(screen.queryByText('0:05')).not.toBeInTheDocument();

    vi.useRealTimers();
  });

  it('ended — hiển thị trạng thái kết thúc + thời lượng', async () => {
    mockedUseCallRoom.mockReturnValue({
      connect: vi.fn(),
      room: {
        on: vi.fn(),
        off: vi.fn(),
        localParticipant: { setMicrophoneEnabled: vi.fn() },
      },
      callId: 'call-1',
      roomDisconnected: false,
      isConnecting: false,
      error: null,
    } as never);
    vi.spyOn(apiClient, 'GET').mockResolvedValue({
      data: {
        data: {
          id: 'call-1',
          matchSessionId: 'session-1',
          status: 'ended',
          startedAt: new Date().toISOString(),
          endedAt: new Date().toISOString(),
          endReason: 'completed',
          durationSeconds: 42,
          billedMinutes: 1,
          freeCallEndsAt: new Date().toISOString(),
        },
      },
    } as never);

    renderRoom();

    expect(await screen.findByText(/Đã kết thúc/)).toBeVisible();
    expect(screen.getByText(/42s/)).toBeVisible();
    expect(
      screen.getByRole('button', { name: 'Yêu thích để làm bạn' }),
    ).toBeVisible();
  });

  it('đã tim từ trước và khi call đã kết thúc — mở chat Litfriend', async () => {
    mockedUseCallRoom.mockReturnValue({
      connect: vi.fn(),
      room: {
        on: vi.fn(),
        off: vi.fn(),
        localParticipant: { setMicrophoneEnabled: vi.fn() },
      },
      callId: 'call-1',
      roomDisconnected: false,
      isConnecting: false,
      error: null,
    } as never);
    vi.spyOn(apiClient, 'GET').mockResolvedValue({
      data: {
        data: {
          id: 'call-1',
          matchSessionId: 'session-1',
          status: 'ended',
          startedAt: new Date().toISOString(),
          endedAt: new Date().toISOString(),
          endReason: 'completed',
          durationSeconds: 42,
          billedMinutes: 1,
          freeCallEndsAt: new Date().toISOString(),
        },
      },
    } as never);
    vi.spyOn(apiClient, 'POST').mockResolvedValue({
      data: {
        data: { liked: true, matched: true, friendUserId: 'partner-1' },
      },
    } as never);

    renderRoom();
    fireEvent.click(
      await screen.findByRole('button', { name: 'Yêu thích để làm bạn' }),
    );

    await waitFor(() =>
      expect(
        screen.getByRole('button', {
          name: 'Mở chat với Litfriend',
        }),
      ).toBeEnabled(),
    );
    expect(routerReplace).toHaveBeenCalledWith('/chat/partner-1');
  });
});
