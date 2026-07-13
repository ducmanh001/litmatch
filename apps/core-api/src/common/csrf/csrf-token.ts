import { randomBytes, timingSafeEqual } from 'node:crypto';

import { CSRF_TOKEN_BYTES } from './csrf.constants';

/** Sinh giá trị CSRF ngẫu nhiên — set song song vào cookie (đọc được) lúc issue/refresh token. */
export function generateCsrfToken(): string {
  return randomBytes(CSRF_TOKEN_BYTES).toString('base64url');
}

/**
 * So khớp double-submit: giá trị cookie client tự động gắn kèm PHẢI khớp giá trị client tự đọc
 * cookie rồi gửi lại qua header (docs: ADR 0007) — kẻ tấn công CSRF không đọc được cookie của
 * victim nên không thể tự tạo header khớp. Constant-time so sánh, tránh timing side-channel.
 * Test riêng (không qua Nest context) — tách hàm thuần theo đúng convention idempotency-key.
 */
export function isValidCsrfToken(
  cookieValue: string | undefined,
  headerValue: string | string[] | undefined,
): boolean {
  const header = Array.isArray(headerValue) ? headerValue[0] : headerValue;
  if (
    cookieValue === undefined ||
    cookieValue === '' ||
    header === undefined ||
    header === ''
  ) {
    return false;
  }
  const cookieBuf = Buffer.from(cookieValue);
  const headerBuf = Buffer.from(header);
  if (cookieBuf.length !== headerBuf.length) return false;
  return timingSafeEqual(cookieBuf, headerBuf);
}
