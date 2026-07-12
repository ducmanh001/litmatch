import createClient from 'openapi-fetch';

import { ApiError, apiErrorFromResponse } from './api-error';

import type { paths } from '../generated/core-api';
import type { TokenStore } from './token-store';
import type { Client, Middleware } from 'openapi-fetch';

/**
 * Path refresh dùng ở 2 chỗ trong file này (gọi rotation + chặn retry đệ quy) — literal
 * này được type-check bởi `paths` generated khi gọi POST, lệch spec là lỗi compile.
 */
const AUTH_REFRESH_PATH = '/api/v1/auth/refresh' satisfies keyof paths;

export type CoreApiClient = Client<paths> & {
  /** Restore access token từ refresh token trước protected UI/realtime. */
  restoreSession(): Promise<boolean>;
  /** Force rotation khi transport khác REST báo access token hết hạn. */
  refreshSession(): Promise<boolean>;
};

export interface ApiClientOptions {
  /** Origin của core-api (không kèm /api/v1 — spec đã chứa prefix trong path). */
  baseUrl: string;
  tokenStore: TokenStore;
  /** Refresh rotation thất bại → app đưa user về login (docs/13 § 13.7). */
  onSessionExpired?: () => void;
  /** Test injection; mặc định fetch toàn cục. */
  fetch?: typeof globalThis.fetch;
}

/**
 * Client REST duy nhất cho core-api (docs/12 § 12.3 — mọi call qua đây, không fetch tay):
 * - Gắn `Authorization: Bearer` từ TokenStore cho mọi request.
 * - Non-2xx → ném `ApiError` (envelope `{ error }` — docs/05 § 5.4); mất mạng → `ApiError.network`.
 * - 401 → refresh rotation đúng MỘT lần (single-flight giữa các request song song) rồi retry;
 *   vẫn 401 hoặc refresh fail → xoá session + `onSessionExpired` (docs/13 § 13.7).
 */
export function createApiClient(options: ApiClientOptions): CoreApiClient {
  const { baseUrl, tokenStore, onSessionExpired } = options;
  const baseFetch = options.fetch ?? globalThis.fetch;
  const refreshLockName = `litmatch-api-refresh:${new URL(baseUrl).origin}`;

  // Clone giữ TRƯỚC khi request bị gửi (body chỉ đọc được 1 lần) — dùng cho retry sau refresh.
  const retryClones = new WeakMap<Request, Request>();
  let refreshInFlight: Promise<boolean> | null = null;
  let refreshAbortController: AbortController | null = null;

  tokenStore.subscribe(() => {
    if (tokenStore.getStatus() === 'unauthenticated') {
      refreshAbortController?.abort();
    }
  });

  const safeFetch = async (
    input: RequestInfo | URL,
    init?: RequestInit,
  ): Promise<Response> => {
    try {
      return await baseFetch(input, init);
    } catch (cause) {
      throw ApiError.network(cause);
    }
  };

  const withCrossTabRefreshLock = async (
    work: () => Promise<boolean>,
  ): Promise<boolean> => {
    if (typeof window === 'undefined') {
      return work();
    }
    // Rotation nhiều tab không được race; browser thiếu Web Locks thì fail closed.
    if (navigator.locks === undefined) return false;
    return navigator.locks.request(refreshLockName, work);
  };

  /** Single-flight: N request cùng dính 401 chỉ tạo 1 lần rotation (docs/10 § 10.1.E). */
  const rotateSession = (): Promise<boolean> => {
    const intentRefreshToken = tokenStore.getRefreshToken();
    refreshInFlight ??= withCrossTabRefreshLock(async () => {
      if (
        tokenStore.getRefreshToken() !== intentRefreshToken &&
        tokenStore.getStatus() === 'authenticated'
      ) {
        return true;
      }
      const refreshToken = tokenStore.getRefreshToken();
      if (refreshToken === null) return false;
      const expectedGeneration = tokenStore.getGeneration();
      const controller = new AbortController();
      refreshAbortController = controller;
      try {
        const response = await safeFetch(`${baseUrl}${AUTH_REFRESH_PATH}`, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ refreshToken }),
          signal: controller.signal,
        });
        if (!response.ok) return false;
        const body: unknown = await response.json();
        if (
          typeof body !== 'object' ||
          body === null ||
          !('data' in body) ||
          typeof body.data !== 'object' ||
          body.data === null ||
          !('accessToken' in body.data) ||
          typeof body.data.accessToken !== 'string' ||
          body.data.accessToken === '' ||
          !('refreshToken' in body.data) ||
          typeof body.data.refreshToken !== 'string' ||
          body.data.refreshToken === ''
        ) {
          return false;
        }
        const committed = tokenStore.setSessionIfCurrent(
          {
            accessToken: body.data.accessToken,
            refreshToken: body.data.refreshToken,
          },
          expectedGeneration,
        );
        return committed || tokenStore.getStatus() === 'authenticated';
      } catch {
        return false;
      } finally {
        if (refreshAbortController === controller)
          refreshAbortController = null;
      }
    }).finally(() => {
      refreshInFlight = null;
    });
    return refreshInFlight;
  };

  const expireSession = (): void => {
    tokenStore.setSession(null);
    onSessionExpired?.();
  };

  const authMiddleware: Middleware = {
    onRequest({ request }) {
      const accessToken = tokenStore.getAccessToken();
      if (accessToken !== null) {
        request.headers.set('authorization', `Bearer ${accessToken}`);
      }
      retryClones.set(request, request.clone());
      return request;
    },
    async onResponse({ request, response }) {
      if (response.ok) return response;

      const isRefreshCall = new URL(request.url).pathname === AUTH_REFRESH_PATH;
      if (
        response.status === 401 &&
        !isRefreshCall &&
        tokenStore.isAuthenticated()
      ) {
        const refreshed = await rotateSession();
        if (!refreshed) {
          expireSession();
          throw await apiErrorFromResponse(response);
        }
        const retry = retryClones.get(request) ?? request;
        retry.headers.set(
          'authorization',
          `Bearer ${tokenStore.getAccessToken() ?? ''}`,
        );
        const retried = await safeFetch(retry);
        if (retried.status === 401) {
          expireSession();
          throw await apiErrorFromResponse(retried);
        }
        if (!retried.ok) throw await apiErrorFromResponse(retried);
        return retried;
      }

      throw await apiErrorFromResponse(response);
    },
  };

  const client = createClient<paths>({
    baseUrl,
    fetch: safeFetch,
  });
  client.use(authMiddleware);
  return Object.assign(client, {
    async restoreSession(): Promise<boolean> {
      if (tokenStore.getAccessToken() !== null) return true;
      if (tokenStore.getRefreshToken() === null) return false;
      const restored = await rotateSession();
      if (!restored) expireSession();
      return restored;
    },
    async refreshSession(): Promise<boolean> {
      const refreshed = await rotateSession();
      if (!refreshed) expireSession();
      return refreshed;
    },
  });
}
