import { realtimeUserChannel } from '@litmatch/common-dtos';

import type { Logger } from '@nestjs/common';
import type { RealtimeEnvelope } from '@litmatch/common-dtos';

import type { RealtimePublisherPort } from './realtime-publisher.port';

/**
 * Publish 1 event realtime cho 1 user qua Redis pub/sub — signaling-gateway subscribe và
 * fanout xuống socket (hợp đồng `@litmatch/common-dtos` realtime-events, docs/services/realtime-gateway.md).
 *
 * BEST-EFFORT theo thiết kế: nuốt lỗi + log warn, KHÔNG throw — event realtime là ephemeral,
 * client luôn còn REST polling làm fallback; publish fail không được phá nghiệp vụ đã commit
 * (vì publish luôn chạy SAU khi DB transaction xong — dual-write chấp nhận, không dùng outbox).
 * Helper chỉ phụ thuộc capability publisher; Redis là một adapter có thể thay thế được.
 */
export async function publishRealtimeEvent(
  publisher: RealtimePublisherPort,
  logger: Logger,
  userId: string,
  envelope: RealtimeEnvelope,
): Promise<void> {
  try {
    await publisher.publish(
      realtimeUserChannel(userId),
      JSON.stringify(envelope),
    );
  } catch (err) {
    logger.warn(
      `Publish realtime '${envelope.event}' cho user ${userId} thất bại (client còn polling fallback): ${
        err instanceof Error ? err.message : String(err)
      }`,
    );
  }
}

export type { RealtimePublisherPort } from './realtime-publisher.port';
export { RedisRealtimePublisher } from './redis-realtime-publisher.adapter';
