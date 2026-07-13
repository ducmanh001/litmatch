import { createApiClient } from './client';
import { ApiError, CLIENT_NETWORK_ERROR, isApiError } from './api-error';
import { createTokenStore, memoryCsrfTokenStorage } from './token-store';
import { vi } from 'vitest';

import type { TokenStore } from './token-store';

const BASE_URL = 'http://core-api.test';

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

function errorBody(code: string): unknown {
  return { error: { code, message: 'msg', traceId: 'trace-1' } };
}

interface Recorded {
  url: string;
  auth: string | null;
  csrfHeader: string | null;
  credentials: RequestCredentials;
}

/** Fetch stub: trả response theo hàng đợi, ghi lại từng request đã nhận. */
function fetchStub(queue: Array<Response | Error>): {
  fetch: typeof fetch;
  calls: Recorded[];
} {
  const calls: Recorded[] = [];
  const impl = async (
    input: RequestInfo | URL,
    init?: RequestInit,
  ): Promise<Response> => {
    const request = input instanceof Request ? input : new Request(input, init);
    calls.push({
      url: new URL(request.url).pathname,
      auth: request.headers.get('authorization'),
      csrfHeader: request.headers.get('x-csrf-token'),
      credentials: request.credentials,
    });
    const next = queue.shift();
    if (next === undefined) throw new Error('fetch stub: hết queue');
    if (next instanceof Error) throw next;
    return next;
  };
  return { fetch: impl as typeof fetch, calls };
}

function storeWithSession(): TokenStore {
  const store = createTokenStore(memoryCsrfTokenStorage());
  store.setSession({ accessToken: 'access-old', csrfToken: 'csrf-old' });
  return store;
}

describe('createApiClient', () => {
  it('gắn Authorization và unwrap {data} theo spec envelope', async () => {
    const { fetch, calls } = fetchStub([
      jsonResponse(200, { data: { id: 'u1' } }),
    ]);
    const client = createApiClient({
      baseUrl: BASE_URL,
      tokenStore: storeWithSession(),
      fetch,
    });

    const res = await client.GET('/api/v1/users/me');

    expect(calls[0].auth).toBe('Bearer access-old');
    expect(res.data).toEqual({ data: { id: 'u1' } });
  });

  it('MỌI request đều credentials:include — thiếu thì browser bỏ Set-Cookie cross-origin (ADR 0007)', async () => {
    const { fetch, calls } = fetchStub([
      jsonResponse(200, { data: { id: 'u1' } }),
    ]);
    const client = createApiClient({
      baseUrl: BASE_URL,
      tokenStore: storeWithSession(),
      fetch,
    });

    await client.GET('/api/v1/users/me');

    expect(calls[0].credentials).toBe('include');
  });

  it('non-2xx → ném ApiError đúng code/traceId/status', async () => {
    const { fetch } = fetchStub([
      jsonResponse(409, errorBody('ECONOMY_WALLET_INSUFFICIENT_BALANCE')),
    ]);
    const client = createApiClient({
      baseUrl: BASE_URL,
      tokenStore: storeWithSession(),
      fetch,
    });

    const err = await client.GET('/api/v1/users/me').catch((e: unknown) => e);

    expect(isApiError(err)).toBe(true);
    expect((err as ApiError).code).toBe('ECONOMY_WALLET_INSUFFICIENT_BALANCE');
    expect((err as ApiError).status).toBe(409);
    expect((err as ApiError).traceId).toBe('trace-1');
  });

  it('mất mạng → ApiError CLIENT_NETWORK_ERROR, không phải TypeError trần', async () => {
    const { fetch } = fetchStub([new TypeError('fetch failed')]);
    const client = createApiClient({
      baseUrl: BASE_URL,
      tokenStore: storeWithSession(),
      fetch,
    });

    const err = await client.GET('/api/v1/users/me').catch((e: unknown) => e);

    expect(isApiError(err)).toBe(true);
    expect((err as ApiError).code).toBe(CLIENT_NETWORK_ERROR);
    expect((err as ApiError).status).toBe(0);
  });

  it('restoreSession sau reload: dùng csrfToken persisted + credentials:include để phục hồi', async () => {
    const { fetch, calls } = fetchStub([
      jsonResponse(200, {
        data: { accessToken: 'access-new', csrfToken: 'csrf-new' },
      }),
    ]);
    // Mô phỏng reload: accessToken mất (memory), csrfToken vẫn còn (persisted — ADR 0007).
    const storage = memoryCsrfTokenStorage();
    storage.set('csrf-old');
    const reloadedStore = createTokenStore(storage);
    const client = createApiClient({
      baseUrl: BASE_URL,
      tokenStore: reloadedStore,
      fetch,
    });

    await expect(client.restoreSession()).resolves.toBe(true);
    expect(reloadedStore.getAccessToken()).toBe('access-new');
    expect(calls.map((call) => call.url)).toEqual(['/api/v1/auth/refresh']);
    expect(calls[0].csrfHeader).toBe('csrf-old');
    expect(calls[0].credentials).toBe('include');
  });

  it('chưa từng đăng nhập (không có csrfToken persisted) → restoreSession false, không gọi API', async () => {
    const { fetch, calls } = fetchStub([]);
    const store = createTokenStore(memoryCsrfTokenStorage());
    const client = createApiClient({
      baseUrl: BASE_URL,
      tokenStore: store,
      fetch,
    });

    await expect(client.restoreSession()).resolves.toBe(false);
    expect(calls).toHaveLength(0);
  });

  it('response refresh đến muộn không được hồi sinh session đã logout', async () => {
    let resolveRefresh: ((response: Response) => void) | undefined;
    const fetch = vi.fn(
      () =>
        new Promise<Response>((resolve) => {
          resolveRefresh = resolve;
        }),
    ) as unknown as typeof globalThis.fetch;
    const store = storeWithSession();
    const client = createApiClient({
      baseUrl: BASE_URL,
      tokenStore: store,
      fetch,
    });

    const refreshing = client.refreshSession();
    await vi.waitFor(() => expect(fetch).toHaveBeenCalledTimes(1));
    store.setSession(null);
    resolveRefresh?.(
      jsonResponse(200, {
        data: { accessToken: 'late-access', csrfToken: 'late-csrf' },
      }),
    );

    await expect(refreshing).resolves.toBe(false);
    expect(store.getStatus()).toBe('unauthenticated');
    expect(store.getAccessToken()).toBeNull();
  });

  it('refresh response sai contract làm session fail closed', async () => {
    const { fetch } = fetchStub([jsonResponse(200, { data: {} })]);
    const store = storeWithSession();
    const client = createApiClient({
      baseUrl: BASE_URL,
      tokenStore: store,
      fetch,
    });

    await expect(client.refreshSession()).resolves.toBe(false);
    expect(store.getStatus()).toBe('unauthenticated');
  });

  it('401 → refresh rotation 1 lần (kèm CSRF header, credentials:include) rồi retry với token mới', async () => {
    const { fetch, calls } = fetchStub([
      jsonResponse(401, errorBody('AUTH_TOKEN_EXPIRED')),
      jsonResponse(200, {
        data: { accessToken: 'access-new', csrfToken: 'csrf-new' },
      }),
      jsonResponse(200, { data: { id: 'u1' } }),
    ]);
    const store = storeWithSession();
    const client = createApiClient({
      baseUrl: BASE_URL,
      tokenStore: store,
      fetch,
    });

    const res = await client.GET('/api/v1/users/me');

    expect(res.data).toEqual({ data: { id: 'u1' } });
    expect(calls.map((c) => c.url)).toEqual([
      '/api/v1/users/me',
      '/api/v1/auth/refresh',
      '/api/v1/users/me',
    ]);
    expect(calls[1].csrfHeader).toBe('csrf-old');
    expect(calls[1].credentials).toBe('include');
    expect(calls[2].auth).toBe('Bearer access-new');
    expect(store.getCsrfToken()).toBe('csrf-new');
  });

  it('retry sau refresh mất mạng vẫn ném ApiError chuẩn hóa', async () => {
    const { fetch } = fetchStub([
      jsonResponse(401, errorBody('AUTH_TOKEN_EXPIRED')),
      jsonResponse(200, {
        data: { accessToken: 'access-new', csrfToken: 'csrf-new' },
      }),
      new TypeError('retry fetch failed'),
    ]);
    const client = createApiClient({
      baseUrl: BASE_URL,
      tokenStore: storeWithSession(),
      fetch,
    });

    const err = await client.GET('/api/v1/users/me').catch((e: unknown) => e);

    expect(isApiError(err)).toBe(true);
    expect((err as ApiError).code).toBe(CLIENT_NETWORK_ERROR);
  });

  it('refresh fail → xoá session + onSessionExpired, KHÔNG retry vòng lặp', async () => {
    const { fetch, calls } = fetchStub([
      jsonResponse(401, errorBody('AUTH_TOKEN_EXPIRED')),
      jsonResponse(401, errorBody('AUTH_REFRESH_REUSED')),
    ]);
    const store = storeWithSession();
    const onSessionExpired = vi.fn();
    const client = createApiClient({
      baseUrl: BASE_URL,
      tokenStore: store,
      fetch,
      onSessionExpired,
    });

    const err = await client.GET('/api/v1/users/me').catch((e: unknown) => e);

    expect(isApiError(err)).toBe(true);
    expect(calls).toHaveLength(2);
    expect(store.isAuthenticated()).toBe(false);
    expect(onSessionExpired).toHaveBeenCalledTimes(1);
  });

  it('2 request song song cùng 401 → chỉ 1 lần refresh (single-flight)', async () => {
    const { fetch, calls } = fetchStub([
      jsonResponse(401, errorBody('AUTH_TOKEN_EXPIRED')),
      jsonResponse(401, errorBody('AUTH_TOKEN_EXPIRED')),
      jsonResponse(200, {
        data: { accessToken: 'access-new', csrfToken: 'csrf-new' },
      }),
      jsonResponse(200, { data: { id: 'a' } }),
      jsonResponse(200, { data: { id: 'b' } }),
    ]);
    const client = createApiClient({
      baseUrl: BASE_URL,
      tokenStore: storeWithSession(),
      fetch,
    });

    const [a, b] = await Promise.all([
      client.GET('/api/v1/users/me'),
      client.GET('/api/v1/users/me'),
    ]);

    expect(a.data).toBeDefined();
    expect(b.data).toBeDefined();
    const refreshCalls = calls.filter((c) => c.url === '/api/v1/auth/refresh');
    expect(refreshCalls).toHaveLength(1);
  });

  it('status unauthenticated (chưa đăng nhập) → 401 ném thẳng, không gọi refresh', async () => {
    const { fetch, calls } = fetchStub([
      jsonResponse(401, errorBody('AUTH_TOKEN_MISSING')),
    ]);
    const store = createTokenStore(memoryCsrfTokenStorage());
    const client = createApiClient({
      baseUrl: BASE_URL,
      tokenStore: store,
      fetch,
    });

    const err = await client.GET('/api/v1/users/me').catch((e: unknown) => e);

    expect(isApiError(err)).toBe(true);
    expect(calls).toHaveLength(1);
  });
});
