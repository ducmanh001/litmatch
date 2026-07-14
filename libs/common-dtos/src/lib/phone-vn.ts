/**
 * Chuẩn hoá số điện thoại di động VN nhập dạng nội địa (docs/13 § 13.6 — FE chỉ đỡ UX, backend
 * vẫn là nguồn thật validate E.164 qua `PHONE_E164` ở `auth-request.dtos.ts`). App hiện chỉ phục
 * vụ VN (không có tín hiệu multi-country trong docs) nên mã quốc gia cố định, không dựng dropdown
 * nhiều nước (docs/11 — không thiết kế cho nhu cầu giả định).
 */
export const VN_COUNTRY_CODE = '+84';

/** Số di động VN chuẩn 2018: 10 số bắt đầu bằng 0, hoặc 9 số nếu đã bỏ số 0 đầu. */
export const VN_LOCAL_PHONE_PATTERN = /^0?[1-9]\d{8}$/u;

/** `null` nếu input không khớp định dạng di động VN (báo lỗi ở tầng gọi, không throw ở đây). */
export function normalizeVnPhone(localInput: string): string | null {
  if (!VN_LOCAL_PHONE_PATTERN.test(localInput)) return null;
  const subscriberNumber = localInput.startsWith('0')
    ? localInput.slice(1)
    : localInput;
  return `${VN_COUNTRY_CODE}${subscriberNumber}`;
}
