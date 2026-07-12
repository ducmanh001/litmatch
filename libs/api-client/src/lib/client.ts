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

export type CoreApiClient = Client<paths>;

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

  // Clone giữ TRƯỚC khi request bị gửi (body chỉ đọc được 1 lần) — dùng cho retry sau refresh.
  const retryClones = new WeakMap<Request, Request>();
  let refreshInFlight: Promise<boolean> | null = null;

  /** Single-flight: N request cùng dính 401 chỉ tạo 1 lần rotation (docs/10 § 10.1.E). */
  const refreshSession = (): Promise<boolean> => {
    refreshInFlight ??= (async () => {
      const refreshToken = tokenStore.getRefreshToken();
      if (refreshToken === null) return false;
      try {
        const response = await baseFetch(`${baseUrl}${AUTH_REFRESH_PATH}`, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ refreshToken }),
        });
        if (!response.ok) return false;
        const body = (await response.json()) as {
          data: { accessToken: string; refreshToken: string };
        };
        tokenStore.setSession(body.data);
        return true;
      } catch {
        return false;
      }
    })().finally(() => {
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
        const refreshed = await refreshSession();
        if (!refreshed) {
          expireSession();
          throw await apiErrorFromResponse(response);
        }
        const retry = retryClones.get(request) ?? request;
        retry.headers.set(
          'authorization',
          `Bearer ${tokenStore.getAccessToken() ?? ''}`,
        );
        const retried = await baseFetch(retry);
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
    fetch: (request) =>
      baseFetch(request).catch((cause: unknown) => {
        throw ApiError.network(cause);
      }),
  });
  client.use(authMiddleware);
  return client;
}
