## Review — Economy payment providers — verify — 2026-08-06

### 1. Luồng nghiệp vụ

`client receipt → EconomyService → IapVerifier port → Apple/Google receipt gateway → provider
transaction id → LedgerService`.

`client payOS intent → PayosService → PayosClient port → payOS HTTP adapter → server snapshot
order → HMAC webhook → lock order → LedgerService`.

Refund không gọi provider trong transaction DB: refund poll claim một batch, gọi Apple/Google
refund gateway có deadline, rồi `RefundService` tạo reversal transaction và cập nhật receipt
trong cùng transaction ledger.

### 2. Bảng giả định

| #   | Giả định                                                               | Vector phá/hậu quả                                       | Vị trí chặn (file:line)                                                                    | Verdict |
| --- | ---------------------------------------------------------------------- | -------------------------------------------------------- | ------------------------------------------------------------------------------------------ | ------- |
| 1   | Business không biết SDK/HTTP/credential provider                       | Provider đổi làm lan phụ thuộc vào Economy               | `economy.module.ts:74-115`; `store-iap-verifier.adapter.ts:12-66`; `payos-client.ts:40-50` | ✅      |
| 2   | Apple consumable phải chọn đúng giao dịch                              | Receipt chứa nhiều giao dịch cùng product bị credit nhầm | `apple-receipt-api.adapter.ts:65-90` yêu cầu `transactionId` khi ambiguous                 | ✅      |
| 3   | Receipt/token invalid là lỗi client, provider outage là lỗi dependency | Retry sai loại hoặc che giấu outage                      | Apple `:57-62,98-127`; Google `google-play-receipt-api.adapter.ts:51-94`                   | ✅      |
| 4   | Provider call phải có timeout và không giữ DB transaction              | Pool/worker bị treo khi store chậm                       | `store-api-http.ts`; `iap-refund-poll.service.ts:88-125`; gateway adapters                 | ✅      |
| 5   | Retry sau timeout payOS không tạo checkout intent thứ hai              | Double payment/order không đối soát được                 | `payos-client.ts:78-120,195-223`; `payos.service.ts:76-159`                                | ✅      |
| 6   | Một provider transaction chỉ credit một lần                            | Receipt replay/concurrent request nhân Diamond           | `economy.service.ts:299-343`; `1752000000000-economy-ledger.ts:33-44,116-128`              | ✅      |
| 7   | Refund không sửa ledger gốc                                            | Mất audit trail hoặc sai số dư                           | `refund.service.ts:65-109`; `ledger.service.ts:197-287`                                    | ✅      |
| 8   | Ledger là double-entry và append-only                                  | Update/delete làm mất nguồn sự thật                      | `ledger.service.ts:112-194`; `1752000000000-economy-ledger.ts:50-80`                       | ✅      |
| 9   | payOS webhook chỉ credit sau verify và đối chiếu snapshot              | Giả webhook hoặc amount/link tamper                      | `payos.service.ts:169-229`; `ports/payos-client.ts:123-173`                                | ✅      |

### 3. Checklist

| Mục                     | Kết quả | Ghi chú                                                                        |
| ----------------------- | ------- | ------------------------------------------------------------------------------ |
| Port/adapter boundary   | PASS    | Apple, Google receipt/refund và payOS được bind qua abstract port trong module |
| Invalid receipt         | PASS    | Apple status/product/transaction và Google purchase state đều fail 4xx rõ ràng |
| Timeout/network failure | PASS    | Chuẩn hoá thành `ServiceUnavailableException`, có AbortSignal deadline         |
| Retry/idempotency       | PASS    | Ledger `idempotencyKey` unique; payOS có GET recovery cùng orderCode           |
| Double-entry            | PASS    | Mọi credit có debit system + credit user                                       |
| Append-only ledger      | PASS    | DB trigger chặn UPDATE/DELETE trên `ledger_entries`                            |
| Refund reversal         | PASS    | Reversal transaction, không sửa/xoá transaction/entry gốc                      |
| Cross-backend boundary  | PASS    | Không thêm deployable backend; adapter nằm trong `core-api` Economy            |

### 4. Test evidence

- Contract/unit tests: `iap-verifier.spec.ts` **PASS**, gồm Apple/Google routing, success,
  invalid receipt, timeout 503 và consumable ambiguity; `payos-client.spec.ts` **PASS**, gồm
  signature, provider response conflict, timeout recovery.
- Auth/economy targeted tests: **5 suites, 34 tests PASS**; toàn bộ Economy/Auth unit specs:
  **13 suites PASS, 76 passed, 17 skipped**.
- PostgreSQL integration: `economy.integration.spec.ts` **17/17 PASS**, gồm IAP success,
  retry/idempotency, payOS concurrency/amount mismatch/late webhook, append-only ledger,
  reversal/refund và refund retry.
- `pnpm agent:verify economy`: **PASS** — agent harness 122/122, OpenAPI, format, lint,
  full core-api test **90 suites / 928 tests**, build.

### 5. Kết luận: PASS

Provider boundary đã được tách khỏi business flow; provider failure không bị biến thành invalid
receipt và không có network I/O trong DB transaction. Các invariant ledger, idempotency và
reversal được giữ nguyên; không có migration sửa/xoá ledger cũ.
