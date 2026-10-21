import type { ConfigService } from '@nestjs/config';
import type { CoreApiEnv } from '../config/env.validation';

/** Runtime limits only: the migration CLI deliberately does not inherit the statement deadline. */
export function postgresRuntimeOptions(
  config: ConfigService<CoreApiEnv, true>,
) {
  return {
    poolSize: config.getOrThrow('DATABASE_POOL_MAX', { infer: true }),
    connectTimeoutMS: config.getOrThrow('DATABASE_POOL_ACQUIRE_TIMEOUT_MS', {
      infer: true,
    }),
    extra: {
      statement_timeout: config.getOrThrow('DATABASE_STATEMENT_TIMEOUT_MS', {
        infer: true,
      }),
    },
  };
}
