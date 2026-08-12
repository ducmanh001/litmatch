import { LivekitPartyRoomAdapter } from './livekit-party-room.adapter';

describe('LivekitPartyRoomAdapter (party port boundary)', () => {
  it('maps room lifecycle and role grant without exposing provider types', async () => {
    const client = {
      createRoom: jest.fn(async () => undefined),
      mintJoinToken: jest.fn(async () => 'token'),
      updateParticipantPublish: jest.fn(async () => 'updated'),
      removeParticipant: jest.fn(async () => undefined),
      deleteRoom: jest.fn(async () => undefined),
      roomExists: jest.fn(async () => true),
      receiveWebhook: jest.fn(async () => ({
        event: 'participant_left',
        roomName: 'party-1',
        participantIdentity: 'user-a',
      })),
    };
    const adapter = new LivekitPartyRoomAdapter(client as never);

    await adapter.createRoom('party-1', {
      maxParticipants: 100,
      emptyTimeoutSeconds: 300,
    });
    expect(client.createRoom).toHaveBeenCalledWith('party-1', {
      maxParticipants: 100,
      emptyTimeoutSeconds: 300,
    });
    await expect(
      adapter.mintJoinToken('party-1', 'user-a', 120, { canPublish: false }),
    ).resolves.toBe('token');
    expect(client.mintJoinToken).toHaveBeenCalledWith(
      'party-1',
      'user-a',
      120,
      { canPublish: false, canPublishData: true },
    );
    await expect(
      adapter.updateParticipantPublish('party-1', 'user-a', true),
    ).resolves.toBe('updated');
    await expect(adapter.roomExists('party-1')).resolves.toBe(true);
    await expect(
      adapter.receiveWebhook('{raw}', 'Bearer signed'),
    ).resolves.toEqual({
      event: 'participant_left',
      roomName: 'party-1',
      participantIdentity: 'user-a',
    });
  });
});
