import { Injectable } from '@nestjs/common';

import { LivekitSdkClient } from '../../../common/livekit/livekit-sdk.client';
import {
  PartyLivekitRoomPort,
  type PartyWebhookEvent,
  type UpdatePublishResult,
} from '../ports/livekit-party-room';

/** Maps the shared LiveKit infrastructure client to the party-room application port. */
@Injectable()
export class LivekitPartyRoomAdapter extends PartyLivekitRoomPort {
  constructor(private readonly client: LivekitSdkClient) {
    super();
  }

  createRoom(
    roomName: string,
    opts: { maxParticipants: number; emptyTimeoutSeconds: number },
  ): Promise<void> {
    return this.client.createRoom(roomName, opts);
  }

  mintJoinToken(
    roomName: string,
    identity: string,
    ttlSeconds: number,
    grants: { canPublish: boolean },
  ): Promise<string> {
    return this.client.mintJoinToken(roomName, identity, ttlSeconds, {
      canPublish: grants.canPublish,
      // Data-channel chat/reactions remain available for audience members.
      canPublishData: true,
    });
  }

  updateParticipantPublish(
    roomName: string,
    identity: string,
    canPublish: boolean,
  ): Promise<UpdatePublishResult> {
    return this.client.updateParticipantPublish(roomName, identity, canPublish);
  }

  removeParticipant(roomName: string, identity: string): Promise<void> {
    return this.client.removeParticipant(roomName, identity);
  }

  deleteRoom(roomName: string): Promise<void> {
    return this.client.deleteRoom(roomName);
  }

  roomExists(roomName: string): Promise<boolean> {
    return this.client.roomExists(roomName);
  }

  async receiveWebhook(
    rawBody: string,
    authHeader: string,
  ): Promise<PartyWebhookEvent> {
    const event = await this.client.receiveWebhook(rawBody, authHeader);
    return {
      event: event.event,
      roomName: event.roomName,
      participantIdentity: event.participantIdentity,
    };
  }
}
