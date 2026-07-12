# 0003. Browser localStorage chỉ là scaffold, production cần cookie hoặc nonce CSP

- **Ngày**: 2026-07-13
- **Trạng thái**: Accepted
- **Thay thế**: ADR 0002
- **Liên quan**: docs/12-frontend-architecture.md § 12.6, docs/13 § 13.11

## Bối cảnh

ADR 0002 yêu cầu CSP chặt nhưng scaffold Next hiện vẫn static và chưa có CSP. Nonce CSP của
Next App Router buộc dynamic rendering, bỏ static optimization/CDN cache; SRI giữ được static
rendering nhưng còn experimental và không tương thích Turbopack. Gắn `unsafe-inline` chỉ làm
header trông có vẻ đầy đủ, không giải quyết rủi ro XSS đối với refresh token trong localStorage.

## Quyết định

Refresh token localStorage chỉ được dùng cho scaffold/dev và môi trường browser chưa public;
không được coi là production-ready. Trước public launch phải tạo ADR triển khai một trong hai:

1. ưu tiên httpOnly cookie cùng threat model CSRF, CORS, migration và rollback; hoặc
2. nonce CSP chặt, chấp nhận dynamic rendering sau khi có benchmark tải/chi phí.

Cho tới khi gate đó đóng: cấm third-party script không kiểm soát, cấm HTML chưa sanitize,
access token chỉ ở memory, rotation/logout multi-tab phải race-safe và không log token/PII.

## Phương án đã loại & lý do

- **CSP tĩnh có `unsafe-inline`** — không chặn được inline script injection, tạo cảm giác an
  toàn giả trong khi refresh token vẫn đọc được bằng JavaScript.
- **SRI experimental ngay** — không tương thích Turbopack hiện tại và chưa đủ ổn định làm
  security boundary production.
- **Ép nonce CSP ngay trong scaffold** — làm toàn bộ route dynamic trước khi có benchmark và
  trước khi backend cookie mode được đánh giá, trái nguyên tắc không tối ưu/đổi runtime mù.

## Hệ quả

- Roadmap phải có security gate chặn public launch; review không được đánh dấu localStorage là
  production-ready chỉ vì auth test và rotation đã pass.
- Khi trigger public/third-party/compliance xuất hiện, không sửa ADR này: tạo ADR kế tiếp với
  threat model, rollout/rollback và bằng chứng browser E2E.
