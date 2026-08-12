/** Sự kiện webhook đã verify + rút gọn về đúng phần calling cần — không leak type SDK ra service. */
export interface LivekitWebhookEvent {
  event: string;
  roomName: string | null;
  participantIdentity: string | null;
}

/**
 * Port nói chuyện với media provider (docs/05 § 5.3 ports/): boundary thật — đổi SFU/mock
 * trong test mà không sửa service. Adapter/provider được bind ở module composition root.
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

  /**
   * Đọc participant đang thật sự ở trong room. Đây là fallback đối soát khi webhook bị mất;
   * service chỉ dùng identity đã được token server cấp, không tin trạng thái do client tự khai.
   */
  abstract listParticipantIdentities(roomName: string): Promise<string[]>;

  /** Verify chữ ký webhook (JWT ký bằng API key/secret) — sai chữ ký thì throw. */
  abstract receiveWebhook(
    rawBody: string,
    authHeader: string,
  ): Promise<LivekitWebhookEvent>;
}
