/**
 * Hằng số của module Auth (docs/05 § 5.1) — hằng có ngữ nghĩa vượt ra ngoài 1 file khai ở đây
 * ngay từ đầu, không đợi nơi dùng thứ 2. Đây là tham số sản phẩm/bảo mật CỐ ĐỊNH (đổi là đổi
 * UX/SMS template hoặc security posture, phải qua review) — không phải config môi trường,
 * nên không nằm trong `.env` (docs/05 § 5.1 case 2 vs 3).
 */

/** Độ dài mã OTP — gắn với SMS template + UI nhập mã. */
export const OTP_CODE_DIGITS = 6;

/** Cửa sổ đếm rate-limit OTP — gắn với ngữ nghĩa "per hour" của AUTH_OTP_REQUESTS_PER_HOUR. */
export const OTP_RATE_WINDOW_MS = 3600 * 1000;

/** Entropy refresh token (bytes) — security param cố định; SHA-256 đủ để hash token entropy cỡ này, không cần bcrypt. */
export const REFRESH_TOKEN_BYTES = 48;

/** Tên cookie httpOnly + path hẹp (ADR 0007) — chỉ gửi kèm request tới đúng nhóm route auth. */
export const REFRESH_TOKEN_COOKIE_NAME = 'refresh_token';
export const REFRESH_TOKEN_COOKIE_PATH = '/api/v1/auth';
