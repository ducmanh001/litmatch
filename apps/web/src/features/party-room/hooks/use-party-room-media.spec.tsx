import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook, waitFor } from '@testing-library/react';
import { vi } from 'vitest';

import { usePartyRoomMedia } from './use-party-room-media';
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

describe('usePartyRoomMedia', () => {
  afterEach(() => vi.restoreAllMocks());

  it('bật mic khi canPublish=true, tắt khi đổi thành false', async () => {
    const room = fakeRoom();
    vi.spyOn(livekit, 'connectMediaRoom').mockResolvedValue(room as never);
    vi.spyOn(livekit, 'disconnectMediaRoom').mockResolvedValue(undefined);
    vi.spyOn(apiClient, 'POST').mockResolvedValue({
      data: {
        data: {
          room: { id: 'r1' },
          membership: {},
          token: 'tok',
          livekitUrl: 'ws://x',
        },
      },
    } as never);

    const { result, rerender, unmount } = renderHook(
      ({ canPublish }) => usePartyRoomMedia('room-1', canPublish),
      { wrapper, initialProps: { canPublish: false } },
    );

    act(() => result.current.connect());
    await waitFor(() => expect(result.current.room).not.toBeNull());
    expect(room.localParticipant.setMicrophoneEnabled).toHaveBeenCalledWith(
      false,
    );

    rerender({ canPublish: true });
    await waitFor(() =>
      expect(room.localParticipant.setMicrophoneEnabled).toHaveBeenCalledWith(
        true,
      ),
    );

    unmount();
  });

  it('cleanup gọi disconnectMediaRoom khi unmount', async () => {
    const room = fakeRoom();
    vi.spyOn(livekit, 'connectMediaRoom').mockResolvedValue(room as never);
    const disconnectSpy = vi
      .spyOn(livekit, 'disconnectMediaRoom')
      .mockResolvedValue(undefined);
    vi.spyOn(apiClient, 'POST').mockResolvedValue({
      data: {
        data: {
          room: { id: 'r1' },
          membership: {},
          token: 'tok',
          livekitUrl: 'ws://x',
        },
      },
    } as never);

    const { result, unmount } = renderHook(
      () => usePartyRoomMedia('room-1', true),
      { wrapper },
    );

    act(() => result.current.connect());
    await waitFor(() => expect(result.current.room).not.toBeNull());

    unmount();

    expect(disconnectSpy).toHaveBeenCalledWith(room);
  });
});
