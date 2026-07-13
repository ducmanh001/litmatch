import { useSyncExternalStore } from 'react';

import { tokenStore } from '../api/client';
import { decodeAccessTokenPayload } from './decode-access-token';

/** userId của phiên hiện tại đọc từ JWT — dùng để UI tự chặn thao tác lên chính mình (vd tự ban). */
export function useCurrentUserId(): string | null {
  return useSyncExternalStore(
    tokenStore.subscribe,
    () => {
      const token = tokenStore.getAccessToken();
      return token === null
        ? null
        : (decodeAccessTokenPayload(token)?.sub ?? null);
    },
    () => null,
  );
}
