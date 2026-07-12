/**
 * Payload access token JWT — hợp đồng giữa nơi KÝ (`auth/services/token.service.ts`) và nơi
 * VERIFY (`common/guards/jwt-auth.guard.ts`). Đúng 1 định nghĩa (docs/05 § 5.1): thêm/đổi claim
 * chỉ sửa file này, 2 đầu lệch nhau là lỗi compile — không phải bug runtime âm thầm.
 * Đặt ở `common/` vì guard (common) không được import từ `modules/`; khi signaling-gateway
 * tự verify token cho WS connection thì chuyển lên `libs/` dùng chung 2 app.
 */
export interface AccessTokenPayload {
  sub: string;
  isGuest: boolean;
}
