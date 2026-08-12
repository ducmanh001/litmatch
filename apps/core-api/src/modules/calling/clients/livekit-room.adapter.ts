import { Injectable } from '@nestjs/common';

import { LivekitSdkClient } from '../../../common/livekit/livekit-sdk.client';
import {
  LivekitRoomPort,
  type LivekitWebhookEvent,
} from '../ports/livekit-room';

/** Maps the shared LiveKit infrastructure client to the calling application port. */
@Injectable()
export class LivekitRoomAdapter extends LivekitRoomPort {
  constructor(private readonly client: LivekitSdkClient) {
    super();
  }

  mintJoinToken(
    roomName: string,
    identity: string,
    ttlSeconds: number,
  ): Promise<string> {
    return this.client.mintJoinToken(roomName, identity, ttlSeconds, {
      canPublish: true,
    });
  }

  deleteRoom(roomName: string): Promise<void> {
    return this.client.deleteRoom(roomName);
  }

  listParticipantIdentities(roomName: string): Promise<string[]> {
    return this.client.listParticipantIdentities(roomName);
  }

  async receiveWebhook(
    rawBody: string,
    authHeader: string,
  ): Promise<LivekitWebhookEvent> {
    const event = await this.client.receiveWebhook(rawBody, authHeader);
    return {
      event: event.event,
      roomName: event.roomName,
      participantIdentity: event.participantIdentity,
    };
  }
}
