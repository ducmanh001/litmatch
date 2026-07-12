import type { ConfigService } from '@nestjs/config';
import type { CoreApiEnv } from '../../../config/env.validation';

/** Mỗi lần gọi tạo deadline mới; không tái dùng AbortSignal đã hết hạn giữa các request. */
export function storeApiAbortSignal(
  config: ConfigService<CoreApiEnv, true>,
): AbortSignal {
  return AbortSignal.timeout(
    config.getOrThrow('ECONOMY_STORE_HTTP_TIMEOUT_MS', { infer: true }),
  );
}
