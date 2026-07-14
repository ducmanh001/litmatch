import { normalizeVnPhone } from './phone-vn';

describe('normalizeVnPhone', () => {
  it.each([
    ['0912345678', '+84912345678'],
    ['912345678', '+84912345678'],
  ])('%s → %s', (input, expected) => {
    expect(normalizeVnPhone(input)).toBe(expected);
  });

  it.each([
    [''],
    ['0'],
    ['091234567'], // thiếu 1 số
    ['09123456789'], // thừa 1 số
    ['0012345678'], // số đầu sau 0 không được là 0
    ['+84912345678'], // đã là E.164, không phải input nội địa
    ['abcdefghi'],
  ])('input không hợp lệ (%j) → null', (input) => {
    expect(normalizeVnPhone(input)).toBeNull();
  });
});
