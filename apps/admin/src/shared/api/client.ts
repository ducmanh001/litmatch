import {
  browserCsrfTokenStorage,
  createApiClient,
  createTokenStore,
} from '@litmatch/api-client';

import { env } from '../env';

/** Key localStorage cho csrfToken (docs/12 § 12.6, ADR 0007) — refresh token là cookie httpOnly, không ở đây. */
const CSRF_TOKEN_STORAGE_KEY = 'litmatch-admin.csrf-token';

export const tokenStore = createTokenStore(
  browserCsrfTokenStorage(CSRF_TOKEN_STORAGE_KEY),
);

/**
 * Client REST duy nhất của app (docs/12 § 12.3). Refresh rotation fail → tokenStore bị xoá
 * và notify — `RequireAuth` subscribe nên tự điều hướng về /login, không cần callback ở đây.
 */
export const apiClient = createApiClient({
  baseUrl: env.VITE_API_URL,
  tokenStore,
});
