/**
 * Hằng số CSRF double-submit cookie (ADR 0007) — hạ tầng dùng chung, không thuộc domain nào
 * (docs/05 § 5.1). Bất kỳ route đọc cookie httpOnly để đổi trạng thái đều dùng lại đúng 2 tên
 * này, không tự đặt tên riêng.
 */
export const CSRF_COOKIE_NAME = 'csrf_token';
export const CSRF_HEADER_NAME = 'x-csrf-token';
export const CSRF_TOKEN_BYTES = 32;
