## Review — Economy payOS / Diamond / VIP / Gift — verify — 2026-07-29

### 1. Luồng nghiệp vụ

`user thật chọn packageId → server snapshot giá/Diamond → tạo order idempotent → gọi payOS ngoài
DB transaction → lưu checkout theo first-writer-wins → user thanh toán → webhook HMAC-verify →
đối chiếu orderCode/amount/currency/paymentLinkId → lock order → ghi double-entry ledger + paid
trong cùng transaction → web đọc trạng thái server → refetch ví`

Diamond sau đó được dùng theo hai luồng canonical:

- `mua VIP → debit user_wallet DIA / credit system_revenue DIA → cộng dồn expiry atomic`
- `tặng quà → debit sender DIA / credit system_gift_pool DIA → mint PTS cho receiver atomic`

### 2. Bảng giả định

| #   | Giả định                                              | Vector phá/hậu quả                     | Vị trí chặn (file:line)                                                                                                                                           | Verdict |
| --- | ----------------------------------------------------- | -------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------- |
| 1   | Client không quyết định giá/Diamond                   | Sửa request để nạp rẻ, nhận nhiều      | `payos.service.ts:76-115`; migration catalog `1756300000000-payos-diamond.ts:11-18`                                                                               | ✅      |
| 2   | Guest không được nạp tiền thật                        | Tài khoản tạm tạo order khó truy vết   | `economy.controller.ts:85-95,167-174`                                                                                                                             | ✅      |
| 3   | Retry cùng intent không tạo order local mới           | Double order/khó đối soát              | DB unique `1756300000000-payos-diamond.ts:38-41`; replay `payos.service.ts:81-126`                                                                                | ✅      |
| 4   | Timeout sau POST không làm mất link đã tạo            | Order local treo hoặc checkout thứ hai | GET recovery `payos-client.ts:93-108,184-213`; conditional save `payos.service.ts:228-254`                                                                        | ✅      |
| 5   | Gọi provider không giữ DB pool/row lock               | payOS chậm làm cạn pool của core-api   | Remote call ngoài transaction `payos.service.ts:228-254`                                                                                                          | ✅      |
| 6   | Browser return URL không được cộng Diamond            | Giả query `paid`                       | Status owner-only `payos.service.ts:132-162`; frontend chỉ invalidate khi server trả paid `payos-payment-status.tsx:10-20,45-49`                                  | ✅      |
| 7   | Webhook giả hoặc outer fields bị sửa không credit     | Tự POST top-up                         | Verify HMAC của `data` và dùng signed `data.code` tại `payos-client.ts:111-161`; controller verify trước write `economy-webhooks.controller.ts:120-133`           | ✅      |
| 8   | Payload thật nhưng sai amount/order/link không credit | Nạp gói lớn bằng số tiền nhỏ           | Đối chiếu snapshot tại `payos.service.ts:165-170,200-203` và test `economy.integration.spec.ts:266-298`                                                           | ✅      |
| 9   | Webhook retry/concurrent chỉ credit một lần           | payOS at-least-once                    | Credit idempotency `payos.service.ts:172-215`; DB transaction key unique `1752000000000-economy-ledger.ts:33-44`; race test `economy.integration.spec.ts:220-264` | ✅      |
| 10  | Ledger credit và order paid không lệch                | Crash giữa hai write                   | `LedgerService.record.withinTransaction` + row lock/update tại `payos.service.ts:172-215`                                                                         | ✅      |
| 11  | Ledger là double-entry, append-only                   | Sửa/xóa lịch sử tiền                   | Hai chân tại `payos.service.ts:185-199`; DB trigger `1752000000000-economy-ledger.ts:50-80`                                                                       | ✅      |
| 12  | VIP không tiêu quá số dư và gia hạn cộng dồn          | Race mua VIP hoặc replay               | Ledger atomic/idempotent và expiry `economy.service.ts:352-445`                                                                                                   | ✅      |
| 13  | Gift không chuyển Diamond user→user                   | Rửa/nhân đôi giá trị                   | DIA vào gift pool, receiver nhận PTS ≤ giá tại `economy.service.ts:494-587`                                                                                       | ✅      |

### 3. Checklist

| Mục                                | Kết quả | Ghi chú                                                                                    |
| ---------------------------------- | ------- | ------------------------------------------------------------------------------------------ |
| Boundary ba backend deployable     | PASS    | payOS là adapter trong Economy của `core-api`, không thêm app                              |
| Giá/số lượng từ server             | PASS    | API chỉ nhận `packageId`; order lưu snapshot bigint                                        |
| DB idempotency unique              | PASS    | Unique cho order intent, orderCode, paymentLinkId, transactionId và ledger transaction     |
| Check + action atomic              | PASS    | Webhook lock order và gắn `transactionId` trong transaction của ledger                     |
| Ledger append-only                 | PASS    | Không có mutation ledger; trigger DB chặn UPDATE/DELETE                                    |
| Webhook fail-closed                | PASS    | HMAC trước query/write; so khớp toàn bộ payment identity                                   |
| Late webhook                       | PASS    | Order đã derive expired vẫn có thể chuyển paid atomic khi webhook hợp lệ                   |
| Frontend không chứa business logic | PASS    | Chỉ hiển thị catalog/link và tin trạng thái backend                                        |
| Direct Diamond transfer            | N/A     | Cố ý không hỗ trợ; Gift đổi DIA của sender thành PTS của receiver theo rule chống gian lận |

### 4. Test evidence

- `INTEGRATION_DB_URL=… pnpm exec jest economy.integration.spec.ts --runInBand`: **17/17
  PASS** trên PostgreSQL 16 thật; chạy Jest trực tiếp nên không dùng Nx cache.
- `pnpm exec jest payos-client.spec.ts --runInBand`: **5/5 PASS**, gồm signature, outer-field
  tamper, POST conflict và timeout recovery.
- Controller boundary + payOS client Jest: **6/6 PASS**, gồm guest bị chặn 403 trước service.
- Web wallet focused Vitest: **8/8 PASS**, gồm pending/paid/expired/cancelled và wallet
  invalidation; Next production build: **PASS**.
- `tsc` cho `tsconfig.app.json` và `tsconfig.spec.json`: **PASS**.
- `pnpm agent:check`: **PASS**; `pnpm openapi:check`: **PASS**; agent harness:
  **82/82 PASS**; Prettier: **PASS**; Nx lint `core-api --skip-nx-cache`: **PASS**.
- `pnpm agent:verify economy` chạy đến full Nx test target thì bị wrapper `timeout 45s` kết
  thúc; các gate phía trước đều PASS và Economy suite bắt buộc đã được chạy riêng trên
  PostgreSQL thật như trên.

### 5. Kết luận: PASS

Luồng nạp Diamond qua payOS giữ đúng invariant Economy, không tin browser, không credit trước
webhook, chống replay/concurrency ở DB và không giữ DB connection qua network I/O. Việc còn lại
trước production là cung cấp credential merchant thật, đăng ký webhook HTTPS và chạy một giao
dịch smoke nhỏ trên tài khoản payOS thực.
