# Economy Service (module trong `core-api`) — đặc tả chi tiết

> Tạo theo quy ước [00-overview-and-index.md](../00-overview-and-index.md) khi bắt đầu code sâu Economy (Giai đoạn 1).
> Nguồn gốc quyết định: [03-architecture.md § 3.8.C](../03-architecture.md), [02-domain-model.md](../02-domain-model.md), [06-domain-rules.md](../06-domain-rules.md).

## 1. Mô hình sổ cái (double-entry)

### Bảng

| Bảng | Vai trò |
|---|---|
| `ledger_accounts` | Tài khoản nội bộ. `kind` + `user_id` (null với tài khoản hệ thống) + `currency`. Unique (kind, user_id, currency). |
| `transactions` | Metadata 1 giao dịch nghiệp vụ. **`idempotency_key` unique ở DB** (1 key/giao dịch), `request_hash` để phát hiện key trùng nhưng nội dung khác, `reversal_of` trỏ giao dịch gốc khi là bút toán đảo, **`actor_user_id`** (ai khởi tạo — user/null=hệ thống/admin) cho audit, `metadata` (jsonb) lưu **snapshot giá tại thời điểm giao dịch** (versioned pricing — xem § 5). Không chứa số tiền (số tiền ở `ledger_entries`). |
| `ledger_entries` | Bút toán Nợ/Có. **Append-only tuyệt đối — có DB trigger chặn UPDATE/DELETE**, không chỉ dựa vào kỷ luật code. |
| `wallets` | Snapshot dẫn xuất: `balance` (DIA) + `earnings` (PTS) + VIP tier/expiry. Cập nhật trong **cùng DB transaction** với insert ledger_entries. **KHÔNG đặt CHECK balance >= 0 ở DB** — số dư âm là trạng thái hợp lệ sau refund/chargeback (nợ diamond, xem § 5); chặn tiêu quá số dư là việc của guard tầng ứng dụng khi `SELECT ... FOR UPDATE` (đọc `balance - amount >= 0`), không phải của constraint snapshot. |
| `iap_products` / `vip_plans` | Catalog: product store → số diamond; plan VIP → giá diamond + số ngày. Không hardcode trong code. |
| `iap_receipts` | Receipt đã verify — nguồn đối soát với Apple/Google. Unique theo (provider, provider_transaction_id). |
| `outbox_events` | Outbox Pattern ([03 § 3.6](../03-architecture.md)): event ghi cùng transaction, relay đọc và publish Kafka sau. |

### Loại tài khoản (`kind`)

- `user_wallet` — diamond của user (currency `DIA`)
- `user_earnings` — điểm quy đổi từ gift (currency `PTS`, dùng từ Giai đoạn 3)
- `system_iap` — nguồn "mint" diamond khi user nạp qua IAP
- `system_revenue` — nơi diamond đã tiêu chảy về (VIP, speed-up...)
- `system_gift_pool`, `system_points_mint` — dùng cho Gift (Giai đoạn 3)
- `system_adjustment` — bút toán sửa sai/đối soát thủ công

### Bất biến (kiểm tra được bằng query)

1. Trong 1 transaction: **tổng Nợ = tổng Có theo từng currency** (validate trong code trước khi commit; job đối soát re-check định kỳ toàn cục). Currency khác nhau (DIA, PTS) **không cộng/trừ lẫn nhau trong cùng 1 chân** — 1 giao dịch chạm 2 currency (vd Gift) tách thành **nhiều chân độc lập, mỗi chân tự cân theo currency của nó** (xem § 6).
2. `wallets.balance` = tổng Có − tổng Nợ trên account `user_wallet` (DIA); `wallets.earnings` = tổng Có − tổng Nợ trên account `user_earnings` (PTS). Cả hai rebuild được bằng `rebuildWallet(userId)`. Giá trị **có thể âm** với `user_wallet` sau refund (xem § 5).
3. Mọi amount là **số nguyên dương** (bigint) — không float ([10 § Economy](../10-code-review-checklist.md)). Dấu Nợ/Có quyết định chiều tiền, không dùng số âm trong `ledger_entries`.
4. `ledger_entries` không bao giờ bị sửa/xoá (trigger DB). "Sửa" = transaction mới `type=reversal` với các bút toán đảo chiều, `reversal_of` trỏ về gốc.
5. **Giá là bất biến sau khi ghi**: mỗi transaction lưu snapshot giá/tỉ lệ áp dụng vào `metadata` (số diamond của gói VIP, tỉ lệ quy đổi gift...). Đổi giá trong `vip_plans`/config **không bao giờ** diễn giải lại giao dịch cũ — luôn đọc giá từ snapshot của chính transaction đó, không tra config hiện tại (chống lỗi [10 § Economy "Discount/ưu đãi tính lại theo trạng thái cũ"](../10-code-review-checklist.md)).

## 2. Luồng nghiệp vụ Giai đoạn 1

### Nạp diamond qua IAP
`POST /api/v1/economy/iap/verify` {provider, payload, productId}
1. `IapVerifier` (theo provider) verify receipt/purchase token **ở server** → trả `providerTransactionId`.
2. Idempotency thật = `iap:{provider}:{providerTransactionId}` (server tự sinh — receipt gửi lại 2 lần chỉ credit 1 lần, kể cả không có header).
3. Tra `iap_products` → số diamond. Ledger: Nợ `system_iap` / Có `user_wallet`. Lưu `iap_receipts` (status `credited`, trỏ `transaction_id`). Ghi snapshot `{productId, diamonds}` vào `transactions.metadata`.
4. **Nếu `user_wallet` đang âm** (còn nợ do refund trước đó): credit mới **tự động bù nợ** — vì balance = tổng Có − tổng Nợ, việc Có thêm sẽ kéo balance lên; không cần logic riêng, chỉ cần không có CHECK >= 0 chặn giữa chừng.

- Dev/test dùng `DevIapVerifier` (chặn cứng ở production, giống DevSmsProvider).
- **Anti-fraud (từ Giai đoạn 1, không đợi Trust & Safety Giai đoạn 4)**: `iap_receipts` unique (provider, provider_transaction_id) chặn replay ở DB; thêm rate-limit số lần verify/user + cảnh báo khi 1 user có tỉ lệ refund-sau-tiêu bất thường (xem § 5).

### Mua VIP bằng diamond
`POST /api/v1/economy/vip/purchase` {planId} + header `Idempotency-Key` (bắt buộc)
1. Tra `vip_plans` → giá diamond + số ngày; **snapshot `{planId, priceDiamond, days}` vào `transactions.metadata`** (versioned pricing — đổi giá gói sau này không đụng giao dịch cũ). Ledger: Nợ `user_wallet` / Có `system_revenue` (check `balance - price >= 0` **sau khi** `SELECT ... FOR UPDATE` wallet — không tin số dư đọc trước đó).
2. Cùng transaction: `vip_expires_at = max(now, vip_expires_at hiện tại) + days` (gia hạn cộng dồn), set `vip_tier`. `actor_user_id` = chính user mua.
3. **Hết hạn tự downgrade = derive khi đọc** (`vip_expires_at > now()` mới tính là active) — không phụ thuộc cron; job dọn dẹp chỉ để normalize + emit event.

### Đọc ví
`GET /api/v1/economy/wallet` — balance + VIP (đã derive active). `GET /api/v1/economy/transactions` — lịch sử, cursor pagination.

### Đối soát (reconciliation) — chạy định kỳ từ Giai đoạn 1
1. Toàn cục: tổng Nợ = tổng Có theo currency; 2. mọi `iap_receipts` đã credit có đúng 1 transaction completed khớp số diamond; 3. sample wallet vs derive từ ledger. Lệch → log error + metric `economy_reconciliation_mismatch_total` (cảnh báo tự động ở Giai đoạn 7).

## 3. Quy tắc concurrency (docs/10 § Economy)

- Điểm tuần tự hoá per-user: `SELECT ... FOR UPDATE` trên dòng `wallets` (lock theo thứ tự userId khi chạm nhiều ví để tránh deadlock).
- Idempotency: unique constraint trên `transactions.idempotency_key` (nguồn chân lý, không check-rồi-insert). Luồng chuẩn: `INSERT ... transaction` → nếu **unique violation** thì đọc lại row đã tồn tại và xử lý theo trạng thái của nó:
  - `request_hash` trùng + transaction đã `completed` → trả lại kết quả cũ (idempotent replay). Response đủ để tái tạo lấy từ `transactions` + ledger của nó, không cần cột cache riêng.
  - `request_hash` trùng nhưng transaction **chưa commit xong** (2 request song song, request đầu đang trong dở transaction) → request sau nhận unique violation *trước* khi request đầu commit; xử lý bằng **retry đọc ngắn có backoff** tới khi row hiện completed, rồi trả kết quả cũ — không tự tạo giao dịch thứ 2.
  - `request_hash` khác → 409 `ECONOMY_TRANSACTION_IDEMPOTENCY_CONFLICT` (cùng key, nội dung khác = lỗi client, không phải retry).
- `LedgerService` là **writer duy nhất** vào ledger/wallet — module khác gọi qua public API của Economy module, không đụng repository trực tiếp (arch test enforce).
- Bắt buộc có integration test race thật trên Postgres: 2 request song song cùng trừ tiền, N request song song cùng idempotency key.

## 4. Event (Outbox)

`economy.diamond.credited` / `economy.diamond.debited` / `economy.vip.purchased` / `economy.diamond.refunded` — payload `{version: 1, transactionId, userId, amount, transactionType}`. Ghi vào `outbox_events` cùng DB transaction; relay (interval, `FOR UPDATE SKIP LOCKED`) publish Kafka topic `litmatch.economy.events`, bật/tắt bằng env.

> **Event là hợp đồng liên module**: mọi module khác tiêu thụ diamond (Matching speed-up, Calling per-phút, Gift) gọi Economy **qua DI trong process** (không qua network — [CLAUDE.md luật 1](../../CLAUDE.md)), nhưng các phản ứng phụ (notification, analytics, trust score) chỉ được nghe **qua event outbox này**, không đọc thẳng bảng của Economy. Thêm loại event mới là non-breaking; đổi/xoá field phải lên `version` mới ([05 § 5.9](../05-coding-standards.md)).

## 5. Refund / Chargeback từ store (chốt ở Giai đoạn 1 vì ảnh hưởng schema)

Apple/Google cho user hoàn tiền **sau khi** đã nạp và có thể **đã tiêu** diamond. Đây là lỗ hổng kinh tế kinh điển nếu không thiết kế từ đầu — phải xử lý bằng bút toán đảo, không xoá/sửa giao dịch gốc.

**Nguồn tín hiệu (server-to-server, không tin client):**
- Apple: **App Store Server Notifications v2** (loại `REFUND`, `REVOKE`).
- Google: **Real-time Developer Notifications (RTDN)** qua Pub/Sub (`voidedPurchaseNotification`).
- Bổ sung job quét định kỳ Apple/Google Voided/Refund API để bắt notification bị miss (không coi webhook là đảm bảo 100%).

**Luồng khi nhận refund hợp lệ (idempotent theo provider_transaction_id):**
1. Tìm `iap_receipts` gốc theo (provider, provider_transaction_id). Nếu đã `refunded` → bỏ qua (idempotent).
2. Tạo transaction `type=reversal`, `reversal_of` = transaction credit gốc, `actor_user_id = null` (hệ thống). Ledger **đảo chiều** giao dịch gốc: Nợ `user_wallet` / Có `system_iap`.
3. Đặt `iap_receipts.status = refunded`.
4. **Nếu user đã tiêu hết/một phần** → `wallets.balance` (snapshot) **âm** = user đang **nợ diamond**. Đây là trạng thái hợp lệ (lý do bỏ CHECK >= 0 ở § 1). Mọi luồng tiêu diamond tiếp theo bị chặn bởi guard `balance - amount >= 0` cho tới khi user nạp bù → nợ được trừ tự động (§ 2).
5. Đánh dấu tín hiệu anti-abuse: refund-sau-khi-tiêu lặp lại nhiều lần là pattern gian lận (farm diamond rồi hoàn tiền) → tăng metric + hạ trust score (Giai đoạn 4) + có thể khoá nạp.

> **Không cho balance âm bằng cách "clamp về 0"** — làm vậy phá bất biến double-entry (tiền biến mất khỏi hệ thống, tổng Nợ ≠ tổng Có). Nợ phải hiện rõ trên sổ để đối soát và đòi lại được.

## 6. Gift = giao dịch nhiều chân, nhiều currency (thiết kế chốt ở Giai đoạn 1, code ở Giai đoạn 3)

Tài khoản Gift (`system_gift_pool`, `system_points_mint`, `user_earnings`) khai từ Giai đoạn 1 nhưng **cơ chế phải chốt ngay** vì nó quyết định hình dạng schema/bất biến, dù luồng code ở Giai đoạn 3.

Gift **không thể** cân trong 1 cặp Nợ/Có duy nhất, vì người tặng mất **DIA** còn người nhận được **PTS** (2 currency, có tỉ lệ quy đổi < 1:1 — [06 § Gift](../06-domain-rules.md)). Mô hình đúng: **1 transaction, 2 chân độc lập, mỗi chân tự cân theo currency của nó** (đúng bất biến § 1.1):

- Chân DIA (tiêu): Nợ `user_wallet` (người tặng) / Có `system_gift_pool` — số DIA đúng bằng giá quà.
- Chân PTS (thưởng): Nợ `system_points_mint` / Có `user_earnings` (người nhận) — số PTS = `giá quà × tỉ lệ quy đổi` (làm tròn xuống, số nguyên).

Cả hai chân nằm trong **cùng 1 DB transaction** (nếu 1 chân fail thì rollback cả hai — chống "trừ mà không cộng"/"cộng mà không trừ", [10 § Gift](../10-code-review-checklist.md)). Snapshot tỉ lệ quy đổi áp dụng lưu vào `transactions.metadata` (§ 1.5). Diamond **không bao giờ** chuyển thẳng user→user 1:1 — chênh lệch (giá quà − PTS thưởng) ở lại `system_gift_pool`/không mint thành DIA (chống rửa diamond, [06 § 3 bất biến](../06-domain-rules.md)).
