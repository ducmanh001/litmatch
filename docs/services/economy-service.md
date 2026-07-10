# Economy Service (module trong `core-api`) — đặc tả chi tiết

> Tạo theo quy ước [00-overview-and-index.md](../00-overview-and-index.md) khi bắt đầu code sâu Economy (Giai đoạn 1).
> Nguồn gốc quyết định: [03-architecture.md § 3.8.C](../03-architecture.md), [02-domain-model.md](../02-domain-model.md), [06-domain-rules.md](../06-domain-rules.md).

## 1. Mô hình sổ cái (double-entry)

### Bảng

| Bảng | Vai trò |
|---|---|
| `ledger_accounts` | Tài khoản nội bộ. `kind` + `user_id` (null với tài khoản hệ thống) + `currency`. Unique (kind, user_id, currency). |
| `transactions` | Metadata 1 giao dịch nghiệp vụ. **`idempotency_key` unique ở DB** (1 key/giao dịch), `request_hash` để phát hiện key trùng nhưng nội dung khác, `reversal_of` trỏ giao dịch gốc khi là bút toán đảo. |
| `ledger_entries` | Bút toán Nợ/Có. **Append-only tuyệt đối — có DB trigger chặn UPDATE/DELETE**, không chỉ dựa vào kỷ luật code. |
| `wallets` | Snapshot dẫn xuất: balance + VIP tier/expiry. Cập nhật trong **cùng DB transaction** với insert ledger_entries. CHECK balance >= 0. |
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

1. Trong 1 transaction: **tổng Nợ = tổng Có theo từng currency** (validate trong code trước khi commit; job đối soát re-check định kỳ toàn cục).
2. `wallets.balance` = tổng Có − tổng Nợ trên account `user_wallet` tương ứng (rebuild được bằng `rebuildWallet(userId)`).
3. Mọi amount là **số nguyên dương** (bigint) — không float ([10 § Economy](../10-code-review-checklist.md)).
4. `ledger_entries` không bao giờ bị sửa/xoá (trigger DB). "Sửa" = transaction mới `type=reversal` với các bút toán đảo chiều, `reversal_of` trỏ về gốc.

## 2. Luồng nghiệp vụ Giai đoạn 1

### Nạp diamond qua IAP
`POST /api/v1/economy/iap/verify` {provider, payload, productId}
1. `IapVerifier` (theo provider) verify receipt/purchase token **ở server** → trả `providerTransactionId`.
2. Idempotency thật = `iap:{provider}:{providerTransactionId}` (server tự sinh — receipt gửi lại 2 lần chỉ credit 1 lần, kể cả không có header).
3. Tra `iap_products` → số diamond. Ledger: Nợ `system_iap` / Có `user_wallet`. Lưu `iap_receipts`.
- Dev/test dùng `DevIapVerifier` (chặn cứng ở production, giống DevSmsProvider).

### Mua VIP bằng diamond
`POST /api/v1/economy/vip/purchase` {planId} + header `Idempotency-Key` (bắt buộc)
1. Tra `vip_plans`. Ledger: Nợ `user_wallet` / Có `system_revenue` (check đủ số dư sau khi `SELECT ... FOR UPDATE` wallet).
2. Cùng transaction: `vip_expires_at = max(now, vip_expires_at hiện tại) + days` (gia hạn cộng dồn), set `vip_tier`.
3. **Hết hạn tự downgrade = derive khi đọc** (`vip_expires_at > now()` mới tính là active) — không phụ thuộc cron; job dọn dẹp chỉ để normalize + emit event.

### Đọc ví
`GET /api/v1/economy/wallet` — balance + VIP (đã derive active). `GET /api/v1/economy/transactions` — lịch sử, cursor pagination.

### Đối soát (reconciliation) — chạy định kỳ từ Giai đoạn 1
1. Toàn cục: tổng Nợ = tổng Có theo currency; 2. mọi `iap_receipts` đã credit có đúng 1 transaction completed khớp số diamond; 3. sample wallet vs derive từ ledger. Lệch → log error + metric `economy_reconciliation_mismatch_total` (cảnh báo tự động ở Giai đoạn 7).

## 3. Quy tắc concurrency (docs/10 § Economy)

- Điểm tuần tự hoá per-user: `SELECT ... FOR UPDATE` trên dòng `wallets` (lock theo thứ tự userId khi chạm nhiều ví để tránh deadlock).
- Idempotency: unique constraint trên `transactions.idempotency_key`; trùng key → trả lại kết quả giao dịch cũ; trùng key nhưng `request_hash` khác → 409 `ECONOMY_TRANSACTION_IDEMPOTENCY_CONFLICT`.
- `LedgerService` là **writer duy nhất** vào ledger/wallet — module khác gọi qua public API của Economy module, không đụng repository trực tiếp (arch test enforce).
- Bắt buộc có integration test race thật trên Postgres: 2 request song song cùng trừ tiền, N request song song cùng idempotency key.

## 4. Event (Outbox)

`economy.diamond.credited` / `economy.diamond.debited` / `economy.vip.purchased` — payload `{version: 1, transactionId, userId, amount, transactionType}`. Ghi vào `outbox_events` cùng DB transaction; relay (interval, `FOR UPDATE SKIP LOCKED`) publish Kafka topic `litmatch.economy.events`, bật/tắt bằng env.
