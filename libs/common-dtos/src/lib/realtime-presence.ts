/**
 * Redis presence key dùng chung giữa signaling-gateway (writer) và core-api (reader).
 * Presence chỉ là state dẫn xuất, không phải nguồn sự thật nghiệp vụ; mỗi lease socket có
 * một member riêng và tự hết hạn khi gateway/Redis gặp sự cố.
 */
export const REALTIME_PRESENCE_KEY_PREFIX = 'realtime:presence:';

export function realtimePresenceKey(userId: string): string {
  return `${REALTIME_PRESENCE_KEY_PREFIX}${userId}`;
}
