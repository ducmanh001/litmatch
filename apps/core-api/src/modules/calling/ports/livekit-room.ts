import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  AccessToken,
  RoomServiceClient,
  WebhookReceiver,
} from 'livekit-server-sdk';

import type { CoreApiEnv } from '../../../config/env.validation';

/** Sự kiện webhook đã verify + rút gọn về đúng phần calling cần — không leak type SDK ra service. */
export interface LivekitWebhookEvent {
  event: string;
  roomName: string | null;
  participantIdentity: string | null;
}

/**
 * Port nói chuyện với LiveKit (docs/05 § 5.3 ports/): boundary thật — đổi SFU/mock trong test
 * mà không sửa service. Impl SDK là duy nhất hiện tại (LiveKit đã chốt — ADR 0001).
 */
export abstract class LivekitRoomPort {
  /** Mint access token join room — identity do SERVER đặt (= userId), client không tự chọn. */
  abstract mintJoinToken(
    roomName: string,
    identity: string,
    ttlSeconds: number,
  ): Promise<string>;

  /** Đóng room trên SFU — caller gọi best-effort ở MỌI nhánh end (chống leak, docs/10 § Calling). */
  abstract deleteRoom(roomName: string): Promise<void>;

  /** Verify chữ ký webhook (JWT ký bằng API key/secret) — sai chữ ký thì throw. */
  abstract receiveWebhook(
    rawBody: string,
    authHeader: string,
  ): Promise<LivekitWebhookEvent>;
}

@Injectable()
export class SdkLivekitRoomPort extends LivekitRoomPort {
  private readonly apiKey: string;
  private readonly apiSecret: string;
  private readonly roomService: RoomServiceClient;
  private readonly receiver: WebhookReceiver;

  constructor(config: ConfigService<CoreApiEnv, true>) {
    super();
    this.apiKey = config.getOrThrow('LIVEKIT_API_KEY', {
      infer: true,
    });
    this.apiSecret = config.getOrThrow('LIVEKIT_API_SECRET', {
      infer: true,
    });
    // RoomServiceClient cần http(s) tới LiveKit thật — LIVEKIT_API_URL nếu có set (server và
    // client trỏ 2 địa chỉ khác nhau, vd LIVEKIT_URL qua proxy chỉ dành cho client), không thì
    // derive từ LIVEKIT_URL như trước
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
  ): Promise<string> {
    const token = new AccessToken(this.apiKey, this.apiSecret, {
      identity,
      ttl: ttlSeconds,
    });
    token.addGrant({
      room: roomName,
      roomJoin: true,
      canPublish: true,
      canSubscribe: true,
    });
    return token.toJwt();
  }

  async deleteRoom(roomName: string): Promise<void> {
    await this.roomService.deleteRoom(roomName);
  }

  async receiveWebhook(
    rawBody: string,
    authHeader: string,
  ): Promise<LivekitWebhookEvent> {
    const event = await this.receiver.receive(rawBody, authHeader);
    return {
      event: event.event,
      roomName: event.room?.name ?? null,
      participantIdentity: event.participant?.identity ?? null,
    };
  }
}
