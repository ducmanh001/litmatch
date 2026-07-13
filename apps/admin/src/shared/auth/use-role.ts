import { useSyncExternalStore } from 'react';

import { tokenStore } from '../api/client';
import { decodeAccessTokenPayload } from './decode-access-token';

import type { Role } from '@litmatch/common-dtos/pure';

/** Role hiện tại đọc từ JWT (docs/12 § 12.7) — null nếu chưa đăng nhập hoặc token hỏng. */
export function useRole(): Role | null {
  return useSyncExternalStore(
    tokenStore.subscribe,
    () => {
      const token = tokenStore.getAccessToken();
      return token === null
        ? null
        : (decodeAccessTokenPayload(token)?.role ?? null);
    },
    () => null,
  );
}
