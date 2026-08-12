import { LivekitRoomAdapter } from './livekit-room.adapter';

describe('LivekitRoomAdapter (calling port boundary)', () => {
  it('maps calling token and webhook operations without exposing provider types', async () => {
    const client = {
      mintJoinToken: jest.fn(async () => 'token'),
      deleteRoom: jest.fn(async () => undefined),
      listParticipantIdentities: jest.fn(async () => ['user-a']),
      receiveWebhook: jest.fn(async () => ({
        event: 'room_finished',
        roomName: 'call-1',
        participantIdentity: null,
      })),
    };
    const adapter = new LivekitRoomAdapter(client as never);

    await expect(adapter.mintJoinToken('call-1', 'user-a', 120)).resolves.toBe(
      'token',
    );
    expect(client.mintJoinToken).toHaveBeenCalledWith('call-1', 'user-a', 120, {
      canPublish: true,
    });
    await expect(adapter.listParticipantIdentities('call-1')).resolves.toEqual([
      'user-a',
    ]);
    await expect(
      adapter.receiveWebhook('{raw}', 'Bearer signed'),
    ).resolves.toEqual({
      event: 'room_finished',
      roomName: 'call-1',
      participantIdentity: null,
    });
  });
});
