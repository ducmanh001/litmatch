/**
 * Payload access token JWT — hợp đồng giữa nơi KÝ (core-api `auth/services/token.service.ts`)
 * và các nơi VERIFY (core-api `common/guards/jwt-auth.guard.ts`, signaling-gateway handshake WS).
 * Đúng 1 định nghĩa (docs/05 § 5.1/§ 5.3): 2 app cùng hợp đồng nên đặt ở libs — thêm/đổi claim
 * chỉ sửa file này, đầu nào lệch là lỗi compile, không phải bug runtime âm thầm.
 */
export interface AccessTokenPayload {
  sub: string;
  isGuest: boolean;
}
