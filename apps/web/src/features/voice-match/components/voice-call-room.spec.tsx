import { ApiError } from '@litmatch/api-client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, render, screen } from '@testing-library/react';
import { vi } from 'vitest';

import { VoiceCallRoom } from './voice-call-room';
import { apiClient } from '../../../shared/api/client';
import { useCallRoom } from '../hooks/use-call-room';

vi.mock('../hooks/use-call-room', () => ({ useCallRoom: vi.fn() }));

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
  afterEach(() => vi.restoreAllMocks());

  it('idle — hiển thị nút bắt đầu cuộc gọi', () => {
    mockedUseCallRoom.mockReturnValue({
      connect: vi.fn(),
      room: null,
      callId: null,
      roomDisconnected: false,
      isConnecting: false,
      error: null,
    } as never);

    renderRoom();

    expect(
      screen.getByRole('button', { name: 'Bắt đầu cuộc gọi' }),
    ).toBeInTheDocument();
  });

  it('connecting — vô hiệu hoá nút và đổi label', () => {
    mockedUseCallRoom.mockReturnValue({
      connect: vi.fn(),
      room: null,
      callId: null,
      roomDisconnected: false,
      isConnecting: true,
      error: null,
    } as never);

    renderRoom();

    expect(
      screen.getByRole('button', { name: 'Đang kết nối…' }),
    ).toBeDisabled();
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
        },
      },
    } as never);

    renderRoom();

    expect(screen.getByRole('button', { name: 'Tắt mic' })).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Kết thúc' }),
    ).toBeInTheDocument();
  });

  it('connected — đồng hồ đếm thời lượng chạy theo giây', async () => {
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
        },
      },
    } as never);

    renderRoom();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });

    expect(await screen.findByText('0:00')).toBeVisible();

    for (let i = 0; i < 5; i += 1) {
      await act(async () => {
        await vi.advanceTimersByTimeAsync(1000);
      });
    }

    expect(await screen.findByText('0:05')).toBeVisible();

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
        },
      },
    } as never);

    renderRoom();

    expect(await screen.findByText(/Đã kết thúc/)).toBeVisible();
    expect(screen.getByText(/42s/)).toBeVisible();
  });
});
