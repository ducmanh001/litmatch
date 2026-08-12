import { LivekitSdkClient } from './livekit-sdk.client';

const mockRoomService = {
  createRoom: jest.fn(),
  updateParticipant: jest.fn(),
  removeParticipant: jest.fn(),
  deleteRoom: jest.fn(),
  listParticipants: jest.fn(),
  listRooms: jest.fn(),
};
const mockReceiver = { receive: jest.fn() };
const mockToken = {
  addGrant: jest.fn(),
  toJwt: jest.fn(),
};

jest.mock('livekit-server-sdk', () => ({
  AccessToken: jest.fn().mockImplementation(() => mockToken),
  RoomServiceClient: jest.fn().mockImplementation(() => mockRoomService),
  WebhookReceiver: jest.fn().mockImplementation(() => mockReceiver),
}));

import {
  AccessToken,
  RoomServiceClient,
  WebhookReceiver,
} from 'livekit-server-sdk';

function makeConfig(overrides: Record<string, unknown> = {}) {
  const values = {
    LIVEKIT_API_KEY: 'api-key',
    LIVEKIT_API_SECRET: 'api-secret',
    LIVEKIT_API_URL: '',
    LIVEKIT_URL: 'wss://edge.livekit.example',
    ...overrides,
  };
  return {
    getOrThrow: (key: string) => values[key],
  };
}

describe('LivekitSdkClient (provider adapter)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockToken.toJwt.mockResolvedValue('jwt-token');
    mockRoomService.listParticipants.mockResolvedValue([
      { identity: 'user-a' },
      { identity: 'user-b' },
    ]);
    mockRoomService.listRooms.mockResolvedValue([{ name: 'party-room-1' }]);
  });

  it('dùng API URL server riêng và tạo token/grant đúng contract', async () => {
    const client = new LivekitSdkClient(
      makeConfig({ LIVEKIT_API_URL: 'https://api.livekit.example' }) as never,
    );

    expect(RoomServiceClient).toHaveBeenCalledWith(
      'https://api.livekit.example',
      'api-key',
      'api-secret',
    );
    expect(WebhookReceiver).toHaveBeenCalledWith('api-key', 'api-secret');

    await expect(
      client.mintJoinToken('call-1', 'user-a', 120, {
        canPublish: true,
      }),
    ).resolves.toBe('jwt-token');
    expect(AccessToken).toHaveBeenCalledWith('api-key', 'api-secret', {
      identity: 'user-a',
      ttl: 120,
    });
    expect(mockToken.addGrant).toHaveBeenCalledWith({
      room: 'call-1',
      roomJoin: true,
      canPublish: true,
      canSubscribe: true,
    });
  });

  it('fallback API URL từ ws/wss URL khi LIVEKIT_API_URL rỗng', () => {
    new LivekitSdkClient(makeConfig() as never);
    expect(RoomServiceClient).toHaveBeenCalledWith(
      'https://edge.livekit.example',
      'api-key',
      'api-secret',
    );
  });

  it('map room lifecycle, participant reconciliation và room existence', async () => {
    const client = new LivekitSdkClient(makeConfig() as never);
    await client.createRoom('party-1', {
      maxParticipants: 100,
      emptyTimeoutSeconds: 300,
    });
    await client.updateParticipantPublish('party-1', 'user-a', true);
    await client.removeParticipant('party-1', 'user-a');
    await client.deleteRoom('party-1');

    await expect(client.listParticipantIdentities('call-1')).resolves.toEqual([
      'user-a',
      'user-b',
    ]);
    await expect(client.roomExists('party-room-1')).resolves.toBe(true);
    expect(mockRoomService.createRoom).toHaveBeenCalledWith({
      name: 'party-1',
      maxParticipants: 100,
      emptyTimeout: 300,
    });
    expect(mockRoomService.updateParticipant).toHaveBeenCalledWith(
      'party-1',
      'user-a',
      undefined,
      { canPublish: true, canSubscribe: true, canPublishData: true },
    );
    expect(mockRoomService.removeParticipant).toHaveBeenCalledWith(
      'party-1',
      'user-a',
    );
    expect(mockRoomService.deleteRoom).toHaveBeenCalledWith('party-1');
    expect(mockRoomService.listRooms).toHaveBeenCalledWith(['party-room-1']);
  });

  it('404 participant được chuẩn hoá thành no-op/not_connected, lỗi khác vẫn propagate', async () => {
    const client = new LivekitSdkClient(makeConfig() as never);
    mockRoomService.updateParticipant.mockRejectedValueOnce({ status: 404 });
    await expect(
      client.updateParticipantPublish('party-1', 'user-a', false),
    ).resolves.toBe('not_connected');

    mockRoomService.removeParticipant.mockRejectedValueOnce({ status: 404 });
    await expect(
      client.removeParticipant('party-1', 'user-a'),
    ).resolves.toBeUndefined();

    const providerError = new Error('LiveKit unavailable');
    mockRoomService.deleteRoom.mockRejectedValueOnce(providerError);
    await expect(client.deleteRoom('party-1')).rejects.toBe(providerError);
  });

  it('verify webhook trước khi map event; lỗi signature không bị nuốt', async () => {
    const client = new LivekitSdkClient(makeConfig() as never);
    mockReceiver.receive.mockResolvedValueOnce({
      event: 'participant_joined',
      room: { name: 'call-1' },
      participant: { identity: 'user-a' },
    });
    await expect(
      client.receiveWebhook('{raw}', 'Bearer signed'),
    ).resolves.toEqual({
      event: 'participant_joined',
      roomName: 'call-1',
      participantIdentity: 'user-a',
    });
    expect(mockReceiver.receive).toHaveBeenCalledWith('{raw}', 'Bearer signed');

    const signatureError = new Error('invalid signature');
    mockReceiver.receive.mockRejectedValueOnce(signatureError);
    await expect(
      client.receiveWebhook('{tampered}', 'Bearer bad'),
    ).rejects.toBe(signatureError);
  });
});
