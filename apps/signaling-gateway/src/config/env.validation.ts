import {
  baseEnvSchema,
  createConfigValidator,
  realtimeRedisUrlsSchema,
} from '@litmatch/config-validator';
import * as Joi from 'joi';

/**
 * Khớp 1-1 với `signalingEnvSchema` bên dưới — type param cho `ConfigService<SignalingEnv, true>`
 * (docs/05 § 5.2, cùng convention `CoreApiEnv` của core-api: sửa key ở schema thì sửa luôn ở đây).
 */
export interface SignalingEnv {
  NODE_ENV: 'development' | 'test' | 'production';
  LOG_LEVEL: 'trace' | 'debug' | 'info' | 'warn' | 'error';
  SIGNALING_PORT: number;
  CORS_ORIGINS: string;
  /** CÙNG secret với core-api — gateway chỉ VERIFY access token, không bao giờ ký. */
  JWT_SECRET: string;
  /** Khoá cũ, CHỈ để verify token đã phát trước lúc xoay khoá; rỗng = tắt. Phải khớp core-api. */
  JWT_SECRET_PREVIOUS: string;
  /**
   * Redis mặc định, cùng core-api: một shard realtime khi không đặt `REALTIME_REDIS_URLS`, và luôn là Redis
   * của Socket.IO cluster adapter (docs/services/realtime-gateway.md § 6–7).
   */
  REDIS_URL: string;
  /**
   * Redis từng shard của mặt phẳng realtime (pub/sub + presence/quota), phân theo userId. Rỗng =
   * một shard là `REDIS_URL`. PHẢI trùng danh sách + thứ tự với core-api (docs/services/realtime-gateway.md § 7).
   */
  REALTIME_REDIS_URLS: string;
  /** `user` = chỉ subscribe channel của user có socket trên pod; `pattern` = PSUBSCRIBE toàn bộ (đường lùi). */
  WS_FANOUT_MODE: 'user' | 'pattern';
  /** Quota socket của một user, enforce atomic bằng Redis trên toàn bộ gateway replica. */
  WS_MAX_CONNECTIONS_PER_USER: number;
  /** TTL lease chống leak quota khi replica chết mà không chạy disconnect hook. */
  WS_CONNECTION_LEASE_MS: number;
  /** Chu kỳ gia hạn lease của mỗi socket; 0 = lease/3. Tăng cùng `WS_CONNECTION_LEASE_MS` để giảm tải Redis ở quy mô lớn. */
  WS_CONNECTION_LEASE_REFRESH_MS: number;
  SENTRY_DSN: string;
  SENTRY_RELEASE: string;
}

export const signalingEnvSchema = Joi.object({
  ...baseEnvSchema,
  SIGNALING_PORT: Joi.number().port().default(3001),
  CORS_ORIGINS: Joi.string().allow('').default(''),
  JWT_SECRET: Joi.string().min(32).required(),
  JWT_SECRET_PREVIOUS: Joi.string()
    .min(32)
    .allow('')
    .invalid(Joi.ref('JWT_SECRET'))
    .default(''),
  REDIS_URL: Joi.string()
    .uri({ scheme: ['redis', 'rediss'] })
    .default('redis://localhost:6379'),
  REALTIME_REDIS_URLS: realtimeRedisUrlsSchema(),
  WS_FANOUT_MODE: Joi.string().valid('user', 'pattern').default('user'),
  WS_MAX_CONNECTIONS_PER_USER: Joi.number().integer().min(1).max(3).default(3),
  WS_CONNECTION_LEASE_MS: Joi.number()
    .integer()
    .min(10_000)
    .max(300_000)
    .default(90_000),
  WS_CONNECTION_LEASE_REFRESH_MS: Joi.number()
    .integer()
    .min(0)
    .max(150_000)
    .default(0),
  SENTRY_DSN: Joi.string()
    .uri({ scheme: ['http', 'https'] })
    .allow('')
    .default(''),
  SENTRY_RELEASE: Joi.string().max(200).allow('').default(''),
});

export const validateSignalingEnv = createConfigValidator(signalingEnvSchema);
