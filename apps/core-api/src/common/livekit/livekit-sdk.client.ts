import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  AccessToken,
  RoomServiceClient,
  WebhookReceiver,
} from 'livekit-server-sdk';

import type { CoreApiEnv } from '../../config/env.validation';

/** Provider-neutral webhook data returned after the LiveKit signature is verified. */
export interface LivekitSdkWebhookEvent {
  event: string;
  roomName: string | null;
  participantIdentity: string | null;
}

export interface LivekitTokenGrant {
  canPublish: boolean;
  canPublishData?: boolean;
}

export type LivekitParticipantUpdateResult = 'updated' | 'not_connected';

/**
 * LiveKit SDK/API adapter. This is the only core-api production file allowed to import the
 * provider SDK; domain modules consume their own ports and module-local adapters instead.
 */
@Injectable()
export class LivekitSdkClient {
  private readonly apiKey: string;
  private readonly apiSecret: string;
  private readonly roomService: RoomServiceClient;
  private readonly receiver: WebhookReceiver;

  constructor(config: ConfigService<CoreApiEnv, true>) {
    this.apiKey = config.getOrThrow('LIVEKIT_API_KEY', { infer: true });
    this.apiSecret = config.getOrThrow('LIVEKIT_API_SECRET', { infer: true });

    // LIVEKIT_API_URL is the server-to-server endpoint. Keep the historical derivation when it
    // is empty so client/browser and API endpoints remain independently configurable.
    const apiUrl = config.getOrThrow('LIVEKIT_API_URL', { infer: true });
    const wsUrl = config.getOrThrow('LIVEKIT_URL', { infer: true });
    this.roomService = new RoomServiceClient(
      apiUrl || wsUrl.replace(/^ws/, 'http'),
      this.apiKey,
      this.apiSecret,
    );
    this.receiver = new WebhookReceiver(this.apiKey, this.apiSecret);
  }

  async mintJoinToken(
    roomName: string,
    identity: string,
    ttlSeconds: number,
    grant: LivekitTokenGrant,
  ): Promise<string> {
    const token = new AccessToken(this.apiKey, this.apiSecret, {
      identity,
      ttl: ttlSeconds,
    });
    token.addGrant({
      room: roomName,
      roomJoin: true,
      canPublish: grant.canPublish,
      canSubscribe: true,
      ...(grant.canPublishData === undefined
        ? {}
        : { canPublishData: grant.canPublishData }),
    });
    return token.toJwt();
  }

  async createRoom(
    roomName: string,
    opts: { maxParticipants: number; emptyTimeoutSeconds: number },
  ): Promise<void> {
    await this.roomService.createRoom({
      name: roomName,
      maxParticipants: opts.maxParticipants,
      emptyTimeout: opts.emptyTimeoutSeconds,
    });
  }

  async updateParticipantPublish(
    roomName: string,
    identity: string,
    canPublish: boolean,
  ): Promise<LivekitParticipantUpdateResult> {
    try {
      await this.roomService.updateParticipant(roomName, identity, undefined, {
        canPublish,
        canSubscribe: true,
        canPublishData: true,
      });
      return 'updated';
    } catch (error) {
      if (this.isNotFound(error)) return 'not_connected';
      throw error;
    }
  }

  async removeParticipant(roomName: string, identity: string): Promise<void> {
    try {
      await this.roomService.removeParticipant(roomName, identity);
    } catch (error) {
      if (this.isNotFound(error)) return;
      throw error;
    }
  }

  async deleteRoom(roomName: string): Promise<void> {
    await this.roomService.deleteRoom(roomName);
  }

  async listParticipantIdentities(roomName: string): Promise<string[]> {
    const participants = await this.roomService.listParticipants(roomName);
    return participants.map((participant) => participant.identity);
  }

  async roomExists(roomName: string): Promise<boolean> {
    const rooms = await this.roomService.listRooms([roomName]);
    return rooms.length > 0;
  }

  async receiveWebhook(
    rawBody: string,
    authHeader: string,
  ): Promise<LivekitSdkWebhookEvent> {
    const event = await this.receiver.receive(rawBody, authHeader);
    return {
      event: event.event,
      roomName: event.room?.name ?? null,
      participantIdentity: event.participant?.identity ?? null,
    };
  }

  /** TwirpError của SDK mang `.status` HTTP — 404 = room/participant không tồn tại. */
  private isNotFound(error: unknown): boolean {
    return (
      typeof error === 'object' &&
      error !== null &&
      'status' in error &&
      (error as { status: unknown }).status === 404
    );
  }
}
