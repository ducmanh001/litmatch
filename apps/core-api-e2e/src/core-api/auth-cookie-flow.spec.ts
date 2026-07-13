import axios from 'axios';

interface AuthTokensBody {
  accessToken: string;
  csrfToken: string;
  expiresIn: number;
  userId: string;
  isGuest: boolean;
}

/** Parse `Set-Cookie` thô (axios/Node không tự quản cookie jar như browser) — lấy value + flags. */
function parseSetCookie(
  setCookieHeaders: string[] | undefined,
  name: string,
): { value: string; flags: string } | null {
  const line = setCookieHeaders?.find((c) => c.startsWith(`${name}=`));
  if (!line) return null;
  const [pair, ...rest] = line.split(';');
  return { value: pair.split('=')[1] ?? '', flags: rest.join(';') };
}

function cookieHeader(cookies: Record<string, string>): string {
  return Object.entries(cookies)
    .map(([k, v]) => `${k}=${v}`)
    .join('; ');
}

describe('Auth cookie flow (ADR 0007 — httpOnly refresh token + CSRF)', () => {
  const deviceId = `core-e2e-auth-cookie-${Date.now()}`;

  async function guestLogin() {
    return axios.post<{ data: AuthTokensBody }>('/api/v1/auth/guest', {
      deviceId,
    });
  }

  it('login: Set-Cookie httpOnly cả 2 cookie, body KHÔNG có refreshToken', async () => {
    const res = await guestLogin();
    const setCookie = res.headers['set-cookie'];

    const refreshCookie = parseSetCookie(setCookie, 'refresh_token');
    const csrfCookie = parseSetCookie(setCookie, 'csrf_token');

    expect(refreshCookie).not.toBeNull();
    expect(refreshCookie?.flags).toMatch(/HttpOnly/i);
    expect(refreshCookie?.flags).toMatch(/SameSite=Strict/i);
    expect(refreshCookie?.flags).toMatch(/Path=\/api\/v1\/auth/i);

    expect(csrfCookie).not.toBeNull();
    expect(csrfCookie?.flags).toMatch(/HttpOnly/i);

    expect(res.data.data.accessToken).toBeTruthy();
    expect(res.data.data.csrfToken).toBeTruthy();
    expect(res.data.data).not.toHaveProperty('refreshToken');
  });

  it('refresh: cookie đúng + X-CSRF-Token đúng → 200, cấp access token mới + rotate cookie', async () => {
    const login = await guestLogin();
    const refreshCookie = parseSetCookie(
      login.headers['set-cookie'],
      'refresh_token',
    );
    const csrfCookie = parseSetCookie(
      login.headers['set-cookie'],
      'csrf_token',
    );
    if (!refreshCookie || !csrfCookie) throw new Error('login thiếu cookie');

    const refreshRes = await axios.post<{ data: AuthTokensBody }>(
      '/api/v1/auth/refresh',
      {},
      {
        headers: {
          cookie: cookieHeader({
            refresh_token: refreshCookie.value,
            csrf_token: csrfCookie.value,
          }),
          'x-csrf-token': login.data.data.csrfToken,
        },
      },
    );

    expect(refreshRes.status).toBe(200);
    expect(refreshRes.data.data.accessToken).toBeTruthy();
    expect(refreshRes.data.data.accessToken).not.toBe(
      login.data.data.accessToken,
    );
    const rotatedRefresh = parseSetCookie(
      refreshRes.headers['set-cookie'],
      'refresh_token',
    );
    expect(rotatedRefresh?.value).not.toBe(refreshCookie.value);
  });

  it('refresh: thiếu header X-CSRF-Token → 401, không xoay được token', async () => {
    const login = await guestLogin();
    const refreshCookie = parseSetCookie(
      login.headers['set-cookie'],
      'refresh_token',
    );
    const csrfCookie = parseSetCookie(
      login.headers['set-cookie'],
      'csrf_token',
    );
    if (!refreshCookie || !csrfCookie) throw new Error('login thiếu cookie');

    const res = await axios
      .post(
        '/api/v1/auth/refresh',
        {},
        {
          headers: {
            cookie: cookieHeader({
              refresh_token: refreshCookie.value,
              csrf_token: csrfCookie.value,
            }),
          },
        },
      )
      .catch((err) => err.response);

    expect(res.status).toBe(401);
    expect(res.data.error.code).toBe('COMMON_CSRF_TOKEN_INVALID');
  });

  it('refresh: X-CSRF-Token SAI (không khớp cookie) → 401', async () => {
    const login = await guestLogin();
    const refreshCookie = parseSetCookie(
      login.headers['set-cookie'],
      'refresh_token',
    );
    const csrfCookie = parseSetCookie(
      login.headers['set-cookie'],
      'csrf_token',
    );
    if (!refreshCookie || !csrfCookie) throw new Error('login thiếu cookie');

    const res = await axios
      .post(
        '/api/v1/auth/refresh',
        {},
        {
          headers: {
            cookie: cookieHeader({
              refresh_token: refreshCookie.value,
              csrf_token: csrfCookie.value,
            }),
            'x-csrf-token': 'gia-tri-sai',
          },
        },
      )
      .catch((err) => err.response);

    expect(res.status).toBe(401);
  });

  it('refresh: không có cookie nào → 401', async () => {
    const res = await axios
      .post('/api/v1/auth/refresh', {}, { headers: { 'x-csrf-token': 'x' } })
      .catch((err) => err.response);

    expect(res.status).toBe(401);
  });

  it('logout: cookie + CSRF đúng → 204, xoá cookie; refresh token cũ hết hiệu lực', async () => {
    const login = await guestLogin();
    const refreshCookie = parseSetCookie(
      login.headers['set-cookie'],
      'refresh_token',
    );
    const csrfCookie = parseSetCookie(
      login.headers['set-cookie'],
      'csrf_token',
    );
    if (!refreshCookie || !csrfCookie) throw new Error('login thiếu cookie');

    const logoutRes = await axios.post(
      '/api/v1/auth/logout',
      {},
      {
        headers: {
          cookie: cookieHeader({
            refresh_token: refreshCookie.value,
            csrf_token: csrfCookie.value,
          }),
          'x-csrf-token': login.data.data.csrfToken,
        },
      },
    );
    expect(logoutRes.status).toBe(204);

    // Refresh token đã revoke — thử refresh lại với cookie CŨ phải fail
    const reuseRes = await axios
      .post(
        '/api/v1/auth/refresh',
        {},
        {
          headers: {
            cookie: cookieHeader({
              refresh_token: refreshCookie.value,
              csrf_token: csrfCookie.value,
            }),
            'x-csrf-token': login.data.data.csrfToken,
          },
        },
      )
      .catch((err) => err.response);
    expect(reuseRes.status).toBe(401);
  });
});
