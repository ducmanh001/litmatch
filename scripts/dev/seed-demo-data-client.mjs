export function createSeedApiClient(apiBaseUrl) {
  async function request(method, path, token, body, extraHeaders = {}) {
    const headers = { 'Content-Type': 'application/json', ...extraHeaders };
    if (token) headers.Authorization = `Bearer ${token}`;
    const response = await fetch(`${apiBaseUrl}${path}`, {
      method,
      headers,
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
    const text = await response.text();
    const json = text ? JSON.parse(text) : undefined;
    if (!response.ok) {
      console.error(
        `  FAIL ${method} ${path} -> ${response.status}`,
        JSON.stringify(json),
      );
      return {
        ok: false,
        status: response.status,
        data: undefined,
        error: json,
      };
    }
    return { ok: true, status: response.status, data: json?.data };
  }

  async function guestLogin(deviceId) {
    return (await request('POST', '/auth/guest', undefined, { deviceId })).data;
  }

  /** OTP có rate-limit thật; retry giữ script deterministic khi seed nhiều account. */
  async function otpLogin(phoneLocal) {
    const phone = `+84${phoneLocal}`;
    let otpRequest;
    for (let attempt = 0; attempt < 4; attempt += 1) {
      otpRequest = await fetch(`${apiBaseUrl}/auth/otp/request`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone }),
      });
      if (otpRequest.status !== 429) break;
      console.log(`  ${phone}: bị rate limit OTP, đợi 65s rồi thử lại...`);
      await new Promise((resolve) => setTimeout(resolve, 65_000));
    }
    if (!otpRequest.ok) return null;
    const otpJson = await otpRequest.json();
    const code = otpJson?.data?.code;
    if (typeof code !== 'string') return null;
    const verify = await request('POST', '/auth/otp/verify', undefined, {
      phone,
      code,
    });
    return verify.ok ? verify.data : null;
  }

  return { request, guestLogin, otpLogin };
}
