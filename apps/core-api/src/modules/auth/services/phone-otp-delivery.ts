import type { CoreApiEnv } from '../../../config/env.validation';

export type OtpDeliveryMode = CoreApiEnv['AUTH_OTP_DELIVERY'];

/**
 * Đăng nhập bằng số điện thoại dùng được khi được bật VÀ có cách giao mã. Một nguồn duy nhất cho
 * `AuthService`, `OtpService` và capability: `disabled` luôn fail-closed (ADR 0008, ADR 0013).
 */
export function isPhoneOtpUsable(
  enabled: boolean,
  delivery: OtpDeliveryMode,
): boolean {
  return enabled && delivery !== 'disabled';
}
