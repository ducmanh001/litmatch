import { decodeAccessTokenPayload } from './decode-access-token';

function fakeJwt(payload: Record<string, unknown>): string {
  const base64url = (s: string) =>
    btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  return `${base64url('{"alg":"none"}')}.${base64url(JSON.stringify(payload))}.sig`;
}

describe('decodeAccessTokenPayload', () => {
  it('token hợp lệ → trả đúng payload có role', () => {
    const token = fakeJwt({ sub: 'u1', isGuest: false, role: 'admin' });
    expect(decodeAccessTokenPayload(token)).toEqual({
      sub: 'u1',
      isGuest: false,
      role: 'admin',
    });
  });

  it('không đủ 3 phần (không phải JWT) → null', () => {
    expect(decodeAccessTokenPayload('a')).toBeNull();
    expect(decodeAccessTokenPayload('a.b')).toBeNull();
  });

  it('payload không phải JSON hợp lệ → null, không throw', () => {
    expect(decodeAccessTokenPayload('a.not-base64-json.c')).toBeNull();
  });

  it('payload thiếu field role → null', () => {
    const token = fakeJwt({ sub: 'u1', isGuest: false });
    expect(decodeAccessTokenPayload(token)).toBeNull();
  });
});
