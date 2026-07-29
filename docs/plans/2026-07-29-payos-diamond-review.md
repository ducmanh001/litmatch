## Review — Economy payOS / Diamond / VIP / Gift — plan — 2026-07-29

### 1. Objective và luồng nghiệp vụ

Tích hợp payOS làm kênh nạp Diamond thật trên web Việt Nam, tái sử dụng ledger hiện có cho
VIP và Gift. payOS chỉ là payment adapter trong `core-api`, không phải backend deployable mới.

Luồng nạp:

`user thật chọn gói server trả → tạo order idempotent → core-api gọi payOS tạo checkout →
user thanh toán → payOS webhook → verify HMAC → lock order + đối chiếu orderCode/amount/currency →
LedgerService credit DIA + đánh dấu paid trong cùng transaction → web đọc trạng thái + refetch ví`

Luồng VIP:

`chọn plan server trả → lock wallet → debit DIA sang system_revenue → cộng dồn expiry →
derive VIP khi đọc`

Luồng Gift:

`chọn gift catalog server trả → lock wallet → debit DIA sang system_gift_pool →
mint PTS theo tỷ lệ cấu hình cho người nhận → ghi GiftEvent/outbox atomic`

### 2. Out of scope

- Không chuyển Diamond trực tiếp user → user, không rút Diamond/PTS ra tiền thật.
- Không payout, marketplace, recurring subscription hoặc tự động gia hạn VIP.
- Không coi `returnUrl`/query phía browser là bằng chứng thanh toán.
- Không thay IAP Apple/Google; payOS là kênh bổ sung cho web Việt Nam.

### 3. Bảng giả định

| #   | Giả định / invariant                        | Vector phá / hậu quả                  | Vị trí chặn dự kiến                                                                     | Verdict |
| --- | ------------------------------------------- | ------------------------------------- | --------------------------------------------------------------------------------------- | ------- |
| 1   | Client không quyết định giá hay số Diamond  | Sửa request để nạp rẻ/nhận nhiều      | API chỉ nhận `packageId`; service đọc snapshot catalog DB                               | ✅      |
| 2   | Guest không được nạp                        | Farm account/ledger khó định danh     | Controller chặn `AuthenticatedUser.isGuest` trước tạo order                             | ✅      |
| 3   | Một intent không tạo nhiều checkout         | Retry/network timeout tạo nhiều order | Unique idempotency key ở DB; replay trả order cũ                                        | ✅      |
| 4   | Return URL không được cộng Diamond          | Giả query `status=PAID`               | Chỉ webhook đã verify HMAC gọi write path credit                                        | ✅      |
| 5   | Webhook giả không ghi DB                    | Attacker tự POST payload              | Verify HMAC-SHA256 bằng checksum secret trước query/write                               | ✅      |
| 6   | Webhook thật nhưng đổi amount/order         | Nạp gói lớn bằng số tiền gói nhỏ      | Đối chiếu orderCode, amount, currency, paymentLinkId và success code với snapshot order | ✅      |
| 7   | Webhook retry/concurrent chỉ credit một lần | payOS at-least-once delivery          | Lock order + `transactions.idempotency_key` unique + order transaction link unique      | ✅      |
| 8   | Ledger và trạng thái paid không lệch        | Crash giữa cộng DIA và update order   | `LedgerService.record.withinTransaction` cập nhật order trong cùng DB transaction       | ✅      |
| 9   | External API lỗi không mint Diamond         | Timeout/429/5xx                       | Order giữ pending/failed rõ; không có ledger entry trước webhook hợp lệ                 | ✅      |
| 10  | VIP không tiêu quá số dư và gia hạn đúng    | Hai request mua song song             | Wallet `FOR UPDATE`, idempotency DB, expiry từ `max(now,current)`                       | ✅      |
| 11  | Gift không thành kênh chuyển tiền 1:1       | Multi-account/rửa Diamond             | DIA vào system gift pool; receiver chỉ nhận PTS theo config                             | ✅      |
| 12  | Secret không lộ frontend/log                | Bundle hoặc error chứa key            | Key chỉ ở env `core-api`; DTO chỉ trả checkout URL/QR/status                            | ✅      |

### 4. Checklist boundary/correctness

- [x] Giữ đúng ba backend deployable; payOS nằm trong Economy module của `core-api`.
- [x] Giá, amount VND và Diamond đều là integer snapshot từ DB.
- [x] `LedgerService` vẫn là writer duy nhất cho ledger/wallet.
- [x] Transaction idempotency unique ở DB; ledger entries append-only.
- [x] Webhook public nhưng fail-closed bằng signature và kiểm tra payload server-side.
- [x] Frontend không tính giá, không tự cộng balance, chỉ refetch server state.
- [x] Gift/VIP dùng flow canonical hiện có, không tạo cơ chế song song.

### 5. Test bắt buộc sau implementation

- Unit adapter: request headers/signature, webhook signature valid/invalid, timeout/non-2xx.
- Postgres integration: replay create order, webhook retry/concurrent, amount mismatch, guest
  blocked, ledger cân và wallet snapshot khớp.
- Web behavior: tải catalog, mở checkout, pending/paid/cancelled và refetch wallet.
- `pnpm openapi:sync`.
- Target test/lint/build liên quan, `pnpm agent:verify economy`,
  `pnpm agent:verify frontend`, đều không dùng Nx cache khi gate yêu cầu.
- `review-module verify` với bảng assumption `file:line` và test Postgres thật.

### 6. Kết luận

**PASS (plan).** Có thể triển khai payOS như kênh nạp web. Nếu payOS không gửi webhook có chữ
ký hợp lệ hoặc payload không khớp snapshot order, hệ thống phải ack lỗi phù hợp nhưng tuyệt đối
không cộng Diamond.
