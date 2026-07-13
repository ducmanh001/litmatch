import { generateCsrfToken, isValidCsrfToken } from './csrf-token';

describe('generateCsrfToken', () => {
  it('sinh giá trị đủ dài, khác nhau mỗi lần gọi', () => {
    const a = generateCsrfToken();
    const b = generateCsrfToken();
    expect(a).not.toBe(b);
    expect(a.length).toBeGreaterThan(20);
  });
});

describe('isValidCsrfToken', () => {
  it('cookie khớp header → true', () => {
    const token = generateCsrfToken();
    expect(isValidCsrfToken(token, token)).toBe(true);
  });

  it('cookie khác header → false', () => {
    expect(isValidCsrfToken('token-a', 'token-b')).toBe(false);
  });

  it('header là mảng (header trùng lặp) → lấy giá trị đầu', () => {
    const token = generateCsrfToken();
    expect(isValidCsrfToken(token, [token, 'khac'])).toBe(true);
    expect(isValidCsrfToken(token, ['khac', token])).toBe(false);
  });

  it.each([
    [undefined, 'x'],
    ['x', undefined],
    ['', 'x'],
    ['x', ''],
    [undefined, undefined],
  ])('thiếu cookie hoặc header (%j, %j) → false', (cookie, header) => {
    expect(isValidCsrfToken(cookie, header)).toBe(false);
  });

  it('độ dài khác nhau → false, không throw (timingSafeEqual cần buffer cùng độ dài)', () => {
    expect(isValidCsrfToken('short', 'much-longer-value')).toBe(false);
  });
});
