/**
 * `@litmatch/api-client` — tầng hợp đồng REST duy nhất giữa frontend và core-api
 * (docs/12 § 12.3, docs/13 § 13.7). Framework-agnostic: không import React/Next.
 * Type sinh từ `openapi/core-api.json` (`pnpm openapi:emit` → `pnpm openapi:gen`).
 */
export { createApiClient } from './lib/client';
export type { ApiClientOptions, CoreApiClient } from './lib/client';
export {
  ApiError,
  isApiError,
  CLIENT_NETWORK_ERROR,
  CLIENT_MALFORMED_ERROR,
} from './lib/api-error';
export {
  createTokenStore,
  browserRefreshTokenStorage,
  memoryRefreshTokenStorage,
} from './lib/token-store';
export type {
  AuthSession,
  RefreshTokenStorage,
  TokenStore,
} from './lib/token-store';
export type { paths, components } from './generated/core-api';

import type { components } from './generated/core-api';
/** Shortcut lấy DTO theo tên schema trong spec: `ApiSchema<'AuthTokensDto'>`. */
export type ApiSchema<K extends keyof components['schemas']> =
  components['schemas'][K];
