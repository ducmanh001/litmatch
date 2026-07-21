import {
  browserCsrfTokenStorage,
  createApiClient,
  createTokenStore,
} from '@litmatch/api-client';

import { env } from '../env';
import { getLocale } from '../i18n/locale-store';

/** Key localStorage cho csrfToken (docs/12 § 12.6, ADR 0007) — refresh token là cookie httpOnly, không ở đây. */
const CSRF_TOKEN_STORAGE_KEY = 'litmatch-web.csrf-token';

export const tokenStore = createTokenStore(
  browserCsrfTokenStorage(CSRF_TOKEN_STORAGE_KEY),
);

/**
 * Client REST duy nhất của app (docs/12 § 12.3). Storage adapter SSR-safe nên module này
 * import được từ server component, nhưng session chỉ tồn tại phía browser.
 */
export const apiClient = createApiClient({
  baseUrl: env.NEXT_PUBLIC_API_URL,
  tokenStore,
  getLocale,
});
