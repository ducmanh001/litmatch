import { beforeEach, describe, expect, it, vi } from 'vitest';

const roomMocks = vi.hoisted(() => ({
  connect: vi.fn(),
  disconnect: vi.fn(),
}));

vi.mock('livekit-client', () => ({
  Room: class MockRoom {
    connect = roomMocks.connect;
    disconnect = roomMocks.disconnect;
  },
  RoomEvent: {
    TrackSubscribed: 'trackSubscribed',
    TrackUnsubscribed: 'trackUnsubscribed',
  },
  Track: { Kind: { Audio: 'audio' } },
}));

import { attachRemoteAudio, connectMediaRoom } from './livekit';

import type { Room } from 'livekit-client';

describe('connectMediaRoom', () => {
  beforeEach(() => {
    roomMocks.connect.mockReset();
    roomMocks.disconnect.mockReset().mockResolvedValue(undefined);
  });

  it('trả room và không disconnect khi handshake thành công', async () => {
    roomMocks.connect.mockResolvedValue(undefined);

    const room = await connectMediaRoom('token', 'ws://livekit');

    expect(room).toBeDefined();
    expect(roomMocks.connect).toHaveBeenCalledWith('ws://livekit', 'token');
    expect(roomMocks.disconnect).not.toHaveBeenCalled();
  });

  it('dọn room đã cấp phát khi handshake thất bại', async () => {
    const error = new Error('handshake failed');
    roomMocks.connect.mockRejectedValue(error);

    await expect(connectMediaRoom('token', 'ws://livekit')).rejects.toBe(error);

    expect(roomMocks.disconnect).toHaveBeenCalledTimes(1);
  });

  it('gắn cả audio publication đã subscribe trước effect và dọn khi unmount', () => {
    const audio = document.createElement('audio');
    audio.play = vi.fn().mockResolvedValue(undefined);
    const track = {
      kind: 'audio',
      attach: vi.fn(() => audio),
      detach: vi.fn(() => [audio]),
    };
    const room = {
      on: vi.fn(),
      off: vi.fn(),
      remoteParticipants: new Map([
        [
          'remote-user',
          {
            trackPublications: new Map([
              ['publication', { isSubscribed: true, track }],
            ]),
          },
        ],
      ]),
    } as unknown as Room;
    const container = document.createElement('div');

    const cleanup = attachRemoteAudio(room, container);

    expect(track.attach).toHaveBeenCalledTimes(1);
    expect(container).toContain(audio);
    cleanup();
    expect(track.detach).toHaveBeenCalledTimes(1);
    expect(container).not.toContain(audio);
  });
});
