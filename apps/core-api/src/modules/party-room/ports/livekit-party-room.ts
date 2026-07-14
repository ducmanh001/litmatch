import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  AccessToken,
  RoomServiceClient,
  WebhookReceiver,
} from 'livekit-server-sdk';

import type { CoreApiEnv } from '../../../config/env.validation';

/** Sự kiện webhook đã verify + rút gọn về đúng phần party cần — không leak type SDK ra service. */
export interface PartyWebhookEvent {
  event: string;
  roomName: string | null;
  participantIdentity: string | null;
}

/**
 * Kết quả đổi grant runtime: `not_connected` = participant không có trên SFU (đã rớt/chưa nối) —
 * an toàn coi như xong vì không nối thì không publish được gì; token mint lần sau lấy role từ DB.
 */
export type UpdatePublishResult = 'updated' | 'not_connected';

/**
 * Port nói chuyện với LiveKit cho phòng multi-party (docs/05 § 5.3 ports/). Khác
 * LivekitRoomPort của calling (phòng 2 người, grant cố định): party cần tạo room TƯỜNG MINH
 * (maxParticipants/emptyTimeout — "mở rộng SFU cho multi-party", docs/07 GĐ3), grant theo
 * role và ĐỔI grant runtime khi host cấp/thu speaker — enforce ở SFU, không tin client
 * (docs/10 § Party Room: audience tự unmute phải bị chặn ở server).
 */
export abstract class PartyLivekitRoomPort {
  /** Tạo room trước khi ai join — cần options nên KHÔNG dựa vào auto-create khi join. */
  abstract createRoom(
    roomName: string,
    opts: { maxParticipants: number; emptyTimeoutSeconds: number },
  ): Promise<void>;

  /** Mint token join — identity do SERVER đặt (= userId); canPublish theo role từ DB. */
  abstract mintJoinToken(
    roomName: string,
    identity: string,
    ttlSeconds: number,
    grants: { canPublish: boolean },
  ): Promise<string>;

  /**
   * Đổi quyền publish của participant ĐANG NỐI — chờ ACK từ SFU rồi mới trả về
   * (docs/10 § Calling: lệnh điều khiển media không đợi ACK → lệch trạng thái).
   */
  abstract updateParticipantPublish(
    roomName: string,
    identity: string,
    canPublish: boolean,
  ): Promise<UpdatePublishResult>;

  /** Kick participant khỏi SFU — dùng khi leave qua REST (DB rời mà SFU còn nối là lệch state). */
  abstract removeParticipant(roomName: string, identity: string): Promise<void>;

  /** Đóng room trên SFU — best-effort ở MỌI nhánh close (chống leak resource, docs/10 § Party Room). */
  abstract deleteRoom(roomName: string): Promise<void>;

  /** Room còn sống trên SFU không — sweeper đối chiếu DB↔SFU khi webhook rớt (spec § 6). */
  abstract roomExists(roomName: string): Promise<boolean>;

  /** Verify chữ ký webhook (JWT ký bằng API key/secret) — sai chữ ký thì throw. */
  abstract receiveWebhook(
    rawBody: string,
    authHeader: string,
  ): Promise<PartyWebhookEvent>;
}

@Injectable()
export class SdkPartyLivekitRoomPort extends PartyLivekitRoomPort {
  private readonly apiKey: string;
  private readonly apiSecret: string;
  private readonly roomService: RoomServiceClient;
  private readonly receiver: WebhookReceiver;

  constructor(config: ConfigService<CoreApiEnv, true>) {
    super();
    this.apiKey = config.getOrThrow('LIVEKIT_API_KEY', { infer: true });
    this.apiSecret = config.getOrThrow('LIVEKIT_API_SECRET', { infer: true });
    // RoomServiceClient cần http(s) tới LiveKit thật — LIVEKIT_API_URL nếu có set (server và
    // client trỏ 2 địa chỉ khác nhau, vd LIVEKIT_URL qua proxy chỉ dành cho client), không thì
    // derive từ LIVEKIT_URL như trước (cùng cách calling)
    const apiUrl = config.getOrThrow('LIVEKIT_API_URL', { infer: true });
    const wsUrl = config.getOrThrow('LIVEKIT_URL', { infer: true });
    this.roomService = new RoomServiceClient(
      apiUrl || wsUrl.replace(/^ws/, 'http'),
      this.apiKey,
      this.apiSecret,
    );
    this.receiver = new WebhookReceiver(this.apiKey, this.apiSecret);
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

  async mintJoinToken(
    roomName: string,
    identity: string,
    ttlSeconds: number,
    grants: { canPublish: boolean },
  ): Promise<string> {
    const token = new AccessToken(this.apiKey, this.apiSecret, {
      identity,
      ttl: ttlSeconds,
    });
    token.addGrant({
      room: roomName,
      roomJoin: true,
      canPublish: grants.canPublish,
      canSubscribe: true,
      // chat/reaction qua data channel mở cho mọi role — chỉ audio bị giới hạn theo role
      canPublishData: true,
    });
    return token.toJwt();
  }

  async updateParticipantPublish(
    roomName: string,
    identity: string,
    canPublish: boolean,
  ): Promise<UpdatePublishResult> {
    try {
      await this.roomService.updateParticipant(roomName, identity, undefined, {
        canPublish,
        canSubscribe: true,
        canPublishData: true,
      });
      return 'updated';
    } catch (err) {
      if (this.isNotFound(err)) return 'not_connected';
      throw err;
    }
  }

  async removeParticipant(roomName: string, identity: string): Promise<void> {
    try {
      await this.roomService.removeParticipant(roomName, identity);
    } catch (err) {
      if (this.isNotFound(err)) return; // đã rớt sẵn — mục tiêu (không còn trên SFU) đã đạt
      throw err;
    }
  }

  async deleteRoom(roomName: string): Promise<void> {
    await this.roomService.deleteRoom(roomName);
  }

  async roomExists(roomName: string): Promise<boolean> {
    const rooms = await this.roomService.listRooms([roomName]);
    return rooms.length > 0;
  }

  async receiveWebhook(
    rawBody: string,
    authHeader: string,
  ): Promise<PartyWebhookEvent> {
    const event = await this.receiver.receive(rawBody, authHeader);
    return {
      event: event.event,
      roomName: event.room?.name ?? null,
      participantIdentity: event.participant?.identity ?? null,
    };
  }

  /** TwirpError của SDK mang `.status` HTTP — 404 = room/participant không tồn tại. */
  private isNotFound(err: unknown): boolean {
    return (
      typeof err === 'object' &&
      err !== null &&
      'status' in err &&
      (err as { status: unknown }).status === 404
    );
  }
}
