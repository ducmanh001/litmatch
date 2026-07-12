import {
  browserRefreshTokenStorage,
  createApiClient,
  createTokenStore,
} from '@litmatch/api-client';

import { env } from '../env';

/** Key localStorage cho refresh token (docs/12 § 12.6) — đổi key là logout toàn bộ user. */
const REFRESH_TOKEN_STORAGE_KEY = 'litmatch-web.refresh-token';

export const tokenStore = createTokenStore(
  browserRefreshTokenStorage(REFRESH_TOKEN_STORAGE_KEY),
);

/**
 * Client REST duy nhất của app (docs/12 § 12.3). Storage adapter SSR-safe nên module này
 * import được từ server component, nhưng session chỉ tồn tại phía browser.
 */
export const apiClient = createApiClient({
  baseUrl: env.NEXT_PUBLIC_API_URL,
  tokenStore,
});
