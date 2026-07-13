import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook, waitFor } from '@testing-library/react';
import { vi } from 'vitest';

import { useCallRoom } from './use-call-room';
import { apiClient } from '../../../shared/api/client';
import * as livekit from '../../../shared/media/livekit';

import type { ReactNode } from 'react';

function fakeRoom() {
  return {
    on: vi.fn(),
    off: vi.fn(),
    localParticipant: {
      setMicrophoneEnabled: vi.fn().mockResolvedValue(undefined),
    },
  };
}

function wrapper({ children }: { children: ReactNode }) {
  const queryClient = new QueryClient({
    defaultOptions: { mutations: { retry: false } },
  });
  return (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
}

describe('useCallRoom', () => {
  afterEach(() => vi.restoreAllMocks());

  it('cleanup gọi disconnectMediaRoom khi unmount', async () => {
    const room = fakeRoom();
    vi.spyOn(livekit, 'connectMediaRoom').mockResolvedValue(room as never);
    const disconnectSpy = vi
      .spyOn(livekit, 'disconnectMediaRoom')
      .mockResolvedValue(undefined);
    vi.spyOn(apiClient, 'POST').mockResolvedValue({
      data: {
        data: {
          call: { id: 'call-1' },
          token: 'tok',
          livekitUrl: 'ws://x',
        },
      },
    } as never);

    const { result, unmount } = renderHook(() => useCallRoom('session-1'), {
      wrapper,
    });

    act(() => result.current.connect());
    await waitFor(() => expect(result.current.room).not.toBeNull());

    unmount();

    expect(disconnectSpy).toHaveBeenCalledWith(room);
  });

  it('connect() gọi lại được nhiều lần (re-join)', async () => {
    const connectSpy = vi
      .spyOn(livekit, 'connectMediaRoom')
      .mockResolvedValue(fakeRoom() as never);
    vi.spyOn(livekit, 'disconnectMediaRoom').mockResolvedValue(undefined);
    vi.spyOn(apiClient, 'POST').mockResolvedValue({
      data: {
        data: { call: { id: 'call-1' }, token: 'tok', livekitUrl: 'ws://x' },
      },
    } as never);

    const { result, unmount } = renderHook(() => useCallRoom('session-1'), {
      wrapper,
    });

    act(() => result.current.connect());
    await waitFor(() => expect(result.current.room).not.toBeNull());

    act(() => result.current.connect());
    await waitFor(() => expect(connectSpy).toHaveBeenCalledTimes(2));

    // Unmount tường minh trong lúc mock còn sống — tránh auto-cleanup của RTL chạy sau
    // restoreAllMocks() và gọi nhầm implementation thật (room giả không có .disconnect()).
    unmount();
  });
});
