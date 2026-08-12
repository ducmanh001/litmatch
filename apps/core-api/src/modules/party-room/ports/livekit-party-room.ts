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
 * Port nói chuyện với media provider cho phòng multi-party (docs/05 § 5.3 ports/). Khác
 * LivekitRoomPort của calling (phòng 2 người, grant cố định): party cần tạo room TƯỜNG MINH
 * (maxParticipants/emptyTimeout — "mở rộng SFU cho multi-party", docs/07 GĐ3), grant theo
 * role và ĐỔI grant runtime khi host cấp/thu speaker — enforce ở SFU, không tin client
 * (docs/10 § Party Room: audience tự unmute phải bị chặn ở server). Adapter/provider được
 * bind ở module composition root.
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
