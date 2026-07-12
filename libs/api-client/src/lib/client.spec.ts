import { createApiClient } from './client';
import { ApiError, CLIENT_NETWORK_ERROR, isApiError } from './api-error';
import { createTokenStore, memoryRefreshTokenStorage } from './token-store';

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
  body: unknown;
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
      body: request.body !== null ? await request.clone().json() : undefined,
    });
    const next = queue.shift();
    if (next === undefined) throw new Error('fetch stub: hết queue');
    if (next instanceof Error) throw next;
    return next;
  };
  return { fetch: impl as typeof fetch, calls };
}

function storeWithSession(): TokenStore {
  const store = createTokenStore(memoryRefreshTokenStorage());
  store.setSession({ accessToken: 'access-old', refreshToken: 'refresh-old' });
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

  it('401 → refresh rotation 1 lần rồi retry với token mới', async () => {
    const { fetch, calls } = fetchStub([
      jsonResponse(401, errorBody('AUTH_TOKEN_EXPIRED')),
      jsonResponse(200, {
        data: { accessToken: 'access-new', refreshToken: 'refresh-new' },
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
    expect(calls[1].body).toEqual({ refreshToken: 'refresh-old' });
    expect(calls[2].auth).toBe('Bearer access-new');
    expect(store.getRefreshToken()).toBe('refresh-new');
  });

  it('refresh fail → xoá session + onSessionExpired, KHÔNG retry vòng lặp', async () => {
    const { fetch, calls } = fetchStub([
      jsonResponse(401, errorBody('AUTH_TOKEN_EXPIRED')),
      jsonResponse(401, errorBody('AUTH_REFRESH_REUSED')),
    ]);
    const store = storeWithSession();
    const onSessionExpired = jest.fn();
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
        data: { accessToken: 'access-new', refreshToken: 'refresh-new' },
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

  it('chưa từng đăng nhập (không refresh token) → 401 ném thẳng, không gọi refresh', async () => {
    const { fetch, calls } = fetchStub([
      jsonResponse(401, errorBody('AUTH_TOKEN_MISSING')),
    ]);
    const store = createTokenStore(memoryRefreshTokenStorage());
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
