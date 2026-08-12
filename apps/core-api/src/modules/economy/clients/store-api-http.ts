import type { ConfigService } from '@nestjs/config';
import type { CoreApiEnv } from '../../../config/env.validation';
import { ServiceUnavailableException } from '@nestjs/common';

/** Mỗi lần gọi tạo deadline mới; không tái dùng AbortSignal đã hết hạn giữa các request. */
export function storeApiAbortSignal(
  config: ConfigService<CoreApiEnv, true>,
): AbortSignal {
  return AbortSignal.timeout(
    config.getOrThrow('ECONOMY_STORE_HTTP_TIMEOUT_MS', { infer: true }),
  );
}

export function storeProviderUnavailable(
  provider: string,
  reason = 'không phản hồi trong thời hạn hoặc đang tạm thời lỗi',
): ServiceUnavailableException {
  return new ServiceUnavailableException(`${provider} ${reason}`);
}

export function isAbortError(error: unknown): boolean {
  return (
    error instanceof DOMException &&
    (error.name === 'AbortError' || error.name === 'TimeoutError')
  );
}
