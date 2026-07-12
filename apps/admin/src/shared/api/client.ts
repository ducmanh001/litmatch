import {
  browserRefreshTokenStorage,
  createApiClient,
  createTokenStore,
} from '@litmatch/api-client';

import { env } from '../env';

/** Key localStorage cho refresh token (docs/12 § 12.6) — đổi key là logout toàn bộ user. */
const REFRESH_TOKEN_STORAGE_KEY = 'litmatch-admin.refresh-token';

export const tokenStore = createTokenStore(
  browserRefreshTokenStorage(REFRESH_TOKEN_STORAGE_KEY),
);

/**
 * Client REST duy nhất của app (docs/12 § 12.3). Refresh rotation fail → tokenStore bị xoá
 * và notify — `RequireAuth` subscribe nên tự điều hướng về /login, không cần callback ở đây.
 */
export const apiClient = createApiClient({
  baseUrl: env.VITE_API_URL,
  tokenStore,
});
