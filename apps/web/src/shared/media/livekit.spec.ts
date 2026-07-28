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
}));

import { connectMediaRoom } from './livekit';

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
});
