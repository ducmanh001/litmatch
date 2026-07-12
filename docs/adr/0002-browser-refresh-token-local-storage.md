# 0002. Browser V1 giữ refresh token trong localStorage

- **Ngày**: 2026-07-13
- **Trạng thái**: Superseded by 0003
- **Liên quan**: docs/12-frontend-architecture.md § 12.6, docs/13 § 13.11

## Bối cảnh

Core-api hiện nhận refresh token trong JSON body và đã có rotation/reuse detection. Chuyển
sang httpOnly cookie cần backend cookie mode, CORS/CSRF policy, migration và rollback riêng.
Frontend browser V1 cần dùng cùng JWT contract với mobile mà không tạo BFF hoặc hệ auth thứ hai.

## Quyết định

V1 giữ access token trong memory và refresh token duy nhất trong `localStorage`. Session phải
bootstrap/refresh trước protected UI và realtime; rotation/logout phải đồng bộ giữa các tab.

## Phương án đã loại & lý do

- **httpOnly cookie ngay trong scaffold** — an toàn hơn trước XSS nhưng mở rộng scope backend,
  cần thiết kế CSRF/CORS và migration riêng.
- **Lưu cả access token trong localStorage** — tăng thời gian khai thác token khi XSS và làm
  mất lợi ích của access token ngắn hạn.
- **Next.js BFF giữ token** — tạo boundary/backend thứ hai trái kiến trúc core-api duy nhất.

## Hệ quả

- Chấp nhận refresh token có thể bị lấy khi XSS. Bắt buộc CSP chặt, không third-party script
  không kiểm soát, cấm HTML không sanitize, rotation/reuse detection và không log token/PII.
- Multi-tab cần coordination để một refresh token không bị rotate đồng thời và để logout ở
  một tab cập nhật tab khác. Browser support baseline phải có Web Locks; thiếu capability này
  thì refresh fail closed thay vì chấp nhận race rotation.
- Xem xét thay ADR khi có một trong các trigger: production browser public, thêm third-party
  script/analytics, security review yêu cầu cookie, hoặc backend sẵn sàng cookie mode.
- Khi chuyển cookie phải tạo ADR mới, threat model CSRF, rollout/rollback và test compatibility.
