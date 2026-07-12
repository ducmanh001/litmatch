# Matching Service (module trong `core-api`) — đặc tả slice M1: Ticket/Queue engine

> Phạm vi file này: CHỈ mục đầu tiên của Giai đoạn 2 (`MatchTicket` + state machine + shard queue + speed-up qua Economy). Soul Match (chat/like), Signaling Gateway thật, tích hợp LiveKit, Calling module là các mục roadmap riêng, KHÔNG thuộc slice này — code sau, khi tới lượt.

## 1. State machine `MatchTicket`

```
queued ──(matcher ghép cặp thành công)──▶ matched ──(cả 2 confirm)──▶ confirmed
  │                                          │
  │ (sweeper: quá MATCHING_QUEUE_MAX_WAIT_SECONDS)   │ (sweeper: quá MATCHING_CONFIRM_TIMEOUT_SECONDS,
  ▼                                          │        1 bên không confirm)
expired                                      ├──▶ expired (bên không confirm)
                                              └──▶ ticket bên ĐÃ confirm được requeue lại `queued`
                                                    (enqueue mới, không mất lượt — docs/10 § Matching)
queued ──(user gọi cancel)──▶ cancelled
```

Transition hợp lệ duy nhất ở tầng service (không tin client gửi trạng thái đích):
`queued→matched`, `queued→expired`, `queued→cancelled`, `matched→confirmed`, `matched→expired`.
Mọi transition khác throw `MATCHING_TICKET_INVALID_TRANSITION`.

## 2. Sharding & Redis queue (docs/03 § 3.8.B)

- Shard key: `matching:queue:{matchType}:{region}:{ageBand}` — `ageBand = floor(age / MATCHING_AGE_BAND_SIZE)`. `matchType` ∈ `soul|voice`.
- Cấu trúc: **Sorted Set**, member = `ticketId`, score = `enqueuedAtMs - speedupBoostMs` (speed-up trừ `MATCHING_PRIORITY_BOOST_MS` khỏi score → nổi lên đầu hàng đợi, score càng nhỏ càng được ghép trước).
- Danh sách shard đang hoạt động: Set `matching:shards:active` (thêm khi enqueue, dọn khi shard rỗng) để matcher worker không phải quét toàn bộ keyspace.
- **Double-lock ghép cặp — atomic bằng `ZPOPMIN key 2`** (Redis native, atomic sẵn không cần Lua vì Redis đơn luồng): lấy 2 ticketId điểm thấp nhất ra khỏi sorted set trong 1 lệnh, đảm bảo 2 matcher instance không bao giờ lấy trùng ticket.
- Sau khi pop khỏi Redis, **verify lại trong Postgres** (không tin trạng thái Redis là nguồn sự thật): cả 2 ticket còn `queued`, không cùng `userId`, không nằm trong danh sách block/report lẫn nhau (docs/06). Verify + transition `queued→matched` + tạo `MatchSession` phải nằm trong **1 transaction Postgres** với `SELECT ... FOR UPDATE` trên 2 ticket đó.
- Ticket nào verify fail (đã bị cancel/hết hạn ở giữa chừng, hoặc bị block) → **không** ghép, tự expire ticket đó; ticket còn hợp lệ → đẩy lại vào Redis với **priority gốc, không mất lượt chờ** (dùng lại `enqueuedAtMs` cũ, không tính lại từ đầu).

## 3. Matcher worker & sweeper

- `MatcherWorkerService`: `@Interval(MATCHING_MATCHER_INTERVAL_MS)`, mỗi tick quét `matching:shards:active`, mỗi shard thử ghép tối đa `MATCHING_MATCHER_BATCH_SIZE` cặp.
- `TicketSweeperService`: `@Interval(MATCHING_SWEEPER_INTERVAL_MS)`:
  - `queued` quá `MATCHING_QUEUE_MAX_WAIT_SECONDS` kể từ `createdAt` → `expired`, xoá khỏi Redis (dùng `ZREM`, ticketId không còn thì bỏ qua — idempotent).
  - `matched` (qua `MatchSession.status = pending_confirm`) quá `MATCHING_CONFIRM_TIMEOUT_SECONDS` kể từ lúc match mà chưa đủ 2 confirm → session `expired`; ticket đã confirm → `queued` lại (enqueue mới, priority mới); ticket chưa confirm → `expired`.

## 4. Speed-up (trừ diamond qua Economy qua DI — docs/03 § 3.7)

- Thêm **1 method mới, generic** vào `EconomyService` (không method riêng cho matching, tránh Economy phình theo từng module gọi tới):
  ```ts
  async spendDiamond(
    userId: string,
    type: TransactionType,           // caller truyền loại giao dịch của mình
    amountDiamond: number,
    idempotencyKey: string,          // caller tự prefix theo domain, vd `matching:speedup:${userId}:${key}`
    metadata: Record<string, unknown>,
  ): Promise<{ transactionId: string; replayed: boolean }>
  ```
  Debit `UserWallet` / Credit `SystemRevenue`, cùng pattern `ledger.record()` + `SELECT FOR UPDATE` như `purchaseVip` — KHÔNG side-effect nghiệp vụ nào khác (không set VIP, không outbox riêng — chỉ default outbox event theo balanceDelta). Thêm `TransactionType.MatchingSpeedup = 'matching_speedup'` vào `transaction.entity.ts`.
- Rate limit `MATCHING_SPEEDUP_MAX_PER_HOUR`: đếm bằng Redis counter `matching:speedup:count:{userId}` (`INCR` + `EXPIRE 3600` chỉ khi counter vừa tạo — atomic bằng 1 lệnh Lua nhỏ hoặc `SET ... NX EX` cho lần đầu), **không** dùng cột đếm trên `MatchTicket` (tránh sai khi nhiều ticket). Vượt giới hạn → `MATCHING_SPEEDUP_RATE_LIMITED` (409), KHÔNG gọi `spendDiamond` (chặn trước khi trừ tiền, không trừ rồi hoàn).
- Thứ tự bắt buộc: check rate limit → `spendDiamond` (đã tự lock+idempotent) → cập nhật `priorityDeadline`/score Redis. Nếu bước cuối lỗi sau khi đã trừ tiền: đây là tiền đã trừ đúng 1 lần (idempotency đảm bảo), completion phía Redis retry được an toàn (không trừ tiền lại).

## 5. Entity

- `MatchTicket extends BaseAppEntity`: `userId (uuid, index)`, `matchType ('soul'|'voice')`, `region (varchar)`, `ageBand (int)`, `status (enum MatchTicketStatus)`, `enqueuedAt (timestamptz)`, `sessionId (uuid, nullable)`. Index `(status, matchType, region, ageBand)` cho sweeper quét theo shard.
- `MatchSession extends BaseAppEntity`: `matchType`, `userAId`, `userBId`, `ticketAId`, `ticketBId`, `status (enum: pending_confirm|confirmed|expired)`, `confirmedAId (nullable timestamptz-check hoặc 2 cột confirmedAAt/confirmedBAt)`, `endedAt (nullable)`.
- 1 user chỉ 1 ticket `queued`/`matched` tại 1 thời điểm (docs/06) → **partial unique index** Postgres: `UNIQUE (user_id) WHERE status IN ('queued','matched')` — chặn ở DB, không chỉ ở code.

## 6. API (`api/v1/matching`)

| Endpoint                             | Idempotency-Key | Mô tả                                                                                                   |
| ------------------------------------ | --------------- | ------------------------------------------------------------------------------------------------------- |
| `POST /matching/tickets`             | có              | Vào hàng đợi — 409 `MATCHING_TICKET_ALREADY_QUEUED` nếu đã có ticket active (khớp partial unique index) |
| `DELETE /matching/tickets/:id`       | không           | Huỷ ticket của chính mình (check ownership — IDOR, docs/10 § 10.1.D)                                    |
| `GET /matching/tickets/:id`          | không           | Trạng thái ticket (poll)                                                                                |
| `POST /matching/tickets/:id/confirm` | không           | Xác nhận match — check ownership + đúng session đang `pending_confirm`                                  |
| `POST /matching/tickets/:id/speedup` | có              | Trừ diamond ưu tiên — xem § 4                                                                           |

## 7. Domain rule tái xác nhận tại thời điểm ghép (docs/10 § 10.0.C)

Check block/report **không chỉ lúc vào queue** — bắt buộc verify lại đúng lúc matcher ghép (§ 2), vì trạng thái block có thể đổi giữa lúc ticket nằm chờ trong queue.

## 8. Config (đã có sẵn `.env.example`, chỉ thiếu Joi validation)

`MATCHING_MATCHER_INTERVAL_MS`, `MATCHING_MATCHER_BATCH_SIZE`, `MATCHING_SWEEPER_INTERVAL_MS`, `MATCHING_QUEUE_MAX_WAIT_SECONDS`, `MATCHING_CONFIRM_TIMEOUT_SECONDS`, `MATCHING_AGE_BAND_SIZE`, `MATCHING_SPEEDUP_PRICE_DIAMOND`, `MATCHING_SPEEDUP_MAX_PER_HOUR`, `MATCHING_PRIORITY_BOOST_MS` — thêm vào `coreApiEnvSchema` (Joi), hiện đang thiếu (chỉ có trong `.env.example`, chưa validate).
