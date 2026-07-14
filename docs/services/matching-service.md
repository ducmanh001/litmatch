# Matching Service (module trong `core-api`) — đặc tả slice M1: Ticket/Queue engine

> Phạm vi file này: mục đầu tiên của Giai đoạn 2 (`MatchTicket` + state machine + shard queue + speed-up qua Economy) + follow-up bộ lọc giới tính (docs/01 #13, § 2.1). Soul Match (chat/like) đã có spec riêng: [soul-match-service.md](./soul-match-service.md) — đọc `MatchSession` qua `MatchingService.findSessionById` (read-only, quyền ghi vẫn thuộc Matching). Signaling Gateway thật, tích hợp LiveKit, Calling module là các mục roadmap riêng, KHÔNG thuộc slice này.

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
- Sau khi pop khỏi Redis, **verify lại trong Postgres** (không tin trạng thái Redis là nguồn sự thật): cả 2 ticket còn `queued`, không cùng `userId`, **preference giới tính khớp 2 chiều (§ 2.1)**, không nằm trong danh sách block/report lẫn nhau (docs/06). Verify + transition `queued→matched` + tạo `MatchSession` phải nằm trong **1 transaction Postgres** với `SELECT ... FOR UPDATE` trên 2 ticket đó.
- Ticket nào verify fail (đã bị cancel/hết hạn ở giữa chừng, hoặc bị block) → **không** ghép, tự expire ticket đó; ticket còn hợp lệ → đẩy lại vào Redis với **priority gốc, không mất lượt chờ** (dùng lại `enqueuedAtMs` cũ, không tính lại từ đầu).

### 2.1 Bộ lọc giới tính (docs/01 #13)

- Client chọn `genderPreference` ∈ `any|male|female` trong body join (không gửi = `any`); snapshot lên ticket cho **lần vào queue này** — đổi ý = cancel + join lại. Retry cùng Idempotency-Key nhưng đổi preference = request khác nội dung → 409.
- **KHÔNG shard theo gender**: filter là điều kiện verify tại thời điểm ghép trong `tryPair`, cùng chỗ với block/report (docs/10 § 10.0.C). Lý do: shard theo gender nổ số shard ×3 và preference `any` sẽ phải quét nhiều shard.
- Check **2 chiều** (`prefA` khớp `genderB` VÀ `prefB` khớp `genderA`); gender đối phương đọc **tươi** từ `users` trong chính transaction verify — user đổi profile giữa lúc chờ vẫn đúng. Preference cụ thể chỉ khớp đúng giá trị đó: user gender `unknown`/`other` chỉ ghép được với preference `any`.
- Cặp không khớp giới = cặp hợp lệ nhưng không ghép → đi cùng nhánh requeue với block/report (score gốc, không mất lượt). Trade-off đã chấp nhận (giống block): cặp không khớp ở đầu shard chặn shard đó tới khi có ứng viên score thấp hơn chen vào hoặc sweeper expire; nếu thành vấn đề thật → slice sau đổi sang pop-k-candidates.
- Sweeper requeue bên đã confirm (§ 3) phải **copy `genderPreference`** sang ticket mới, không rơi về default.

## 3. Matcher worker & sweeper

- `MatcherWorkerService`: đăng ký interval động bằng `SchedulerRegistry`, đọc
  `MATCHING_MATCHER_INTERVAL_MS`; mỗi tick quét `matching:shards:active`, mỗi shard thử ghép tối
  đa `MATCHING_MATCHER_BATCH_SIZE` cặp.
- `TicketSweeperService`: đăng ký interval động bằng `SchedulerRegistry`, đọc
  `MATCHING_SWEEPER_INTERVAL_MS`:
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

- `MatchTicket extends BaseAppEntity`: `userId (uuid, index)`, `matchType ('soul'|'voice')`, `region (varchar)`, `ageBand (int)`, `genderPreference ('any'|'male'|'female', default 'any' — § 2.1)`, `status (enum MatchTicketStatus)`, `enqueuedAt (timestamptz)`, `sessionId (uuid, nullable)`. Index `(status, matchType, region, ageBand)` cho sweeper quét theo shard.
- `MatchSession extends BaseAppEntity`: `matchType`, `userAId`, `userBId`, `ticketAId`, `ticketBId`, `status (enum: pending_confirm|confirmed|expired)`, `confirmedAId (nullable timestamptz-check hoặc 2 cột confirmedAAt/confirmedBAt)`, `endedAt (nullable)`.
- 1 user chỉ 1 ticket `queued`/`matched` tại 1 thời điểm (docs/06) → **partial unique index** Postgres: `UNIQUE (user_id) WHERE status IN ('queued','matched')` — chặn ở DB, không chỉ ở code.

## 6. API (`api/v1/matching`)

| Endpoint                             | Idempotency-Key | Mô tả                                                                                                                                                    |
| ------------------------------------ | --------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `POST /matching/tickets`             | có              | Vào hàng đợi (body: `matchType`, `genderPreference?` — § 2.1) — 409 `MATCHING_TICKET_ALREADY_QUEUED` nếu đã có ticket active (khớp partial unique index) |
| `DELETE /matching/tickets/:id`       | không           | Huỷ ticket của chính mình (check ownership — IDOR, docs/10 § 10.1.D)                                                                                     |
| `GET /matching/tickets/:id`          | không           | Trạng thái ticket (poll)                                                                                                                                 |
| `POST /matching/tickets/:id/confirm` | không           | Xác nhận match — check ownership + đúng session đang `pending_confirm`                                                                                   |
| `POST /matching/tickets/:id/speedup` | có              | Trừ diamond ưu tiên — xem § 4                                                                                                                            |

## 7. Domain rule tái xác nhận tại thời điểm ghép (docs/10 § 10.0.C)

Check block/report **không chỉ lúc vào queue** — bắt buộc verify lại đúng lúc matcher ghép (§ 2), vì trạng thái block có thể đổi giữa lúc ticket nằm chờ trong queue.

## 8. Config

`MATCHING_MATCHER_INTERVAL_MS`, `MATCHING_MATCHER_BATCH_SIZE`,
`MATCHING_SWEEPER_INTERVAL_MS`, `MATCHING_QUEUE_MAX_WAIT_SECONDS`,
`MATCHING_CONFIRM_TIMEOUT_SECONDS`, `MATCHING_AGE_BAND_SIZE`,
`MATCHING_SPEEDUP_PRICE_DIAMOND`, `MATCHING_SPEEDUP_MAX_PER_HOUR`,
`MATCHING_PRIORITY_BOOST_MS` đã có đủ trong `.env.example`, `CoreApiEnv` và
`coreApiEnvSchema` (Joi); code đọc qua `ConfigService<CoreApiEnv, true>`.

## 9. Invite — CTA "mời Voice/Soul Match" (W4) {#invite}

> Mitigation chính cho rủi ro graph bạn bè sparse (docs/plans/2026-07-14-plan-6-tinh-nang-social-discovery.md
> § 3.1, § 4, § 6): Discovery/Nearby chỉ cho xem profile là ngõ cụt cho dating app — directed
> invite là lối vào **có chủ đích** cho pipeline matching sẵn có, KHÔNG phải friend-request flow
> mới. Sống trong module `matching` (`services/invite.service.ts`) vì ghi thẳng
> `MatchTicket`/`MatchSession` — Discovery/Nearby chỉ là UI nguồn `inviteeUserId`.

### 9.1 State machine `MatchInvite`

```text
pending ──(invitee accept)──▶ accepted
   │
   ├──(invitee decline)──▶ declined
   ├──(inviter cancel, trước khi có phản hồi)──▶ cancelled
   └──(sweeper: quá MATCHING_INVITE_TTL_SECONDS)──▶ expired
```

Transition hợp lệ duy nhất (`MATCH_INVITE_TRANSITIONS`, không tin client gửi trạng thái đích):
`pending→accepted|declined|expired|cancelled`. Mọi transition khác throw
`MATCHING_INVITE_INVALID_TRANSITION`. Lazy-expire: `accept`/`decline`/`cancel` đều tự kiểm tra
`expiresAt` tại THỜI ĐIỂM hành động (docs/10 § 10.0.C) — không tin sweeper đã chạy kịp.

### 9.2 Accept — tạo trực tiếp ticket/session, bỏ qua hàng đợi shard

Khác auto-match (2 ticket độc lập vào queue rồi chờ matcher ghép), accept invite tạo **trực
tiếp** 2 `MatchTicket{status: matched}` + 1 `MatchSession{status: pending_confirm}` trong 1
transaction — tái dùng NGUYÊN các validate của `tryPair` (§ 2):

- **1-user-1-queue** (docs/06): cùng partial unique index `uq_match_tickets_active_user` — insert
  2 ticket mới cũng phải qua index này; vi phạm (1 trong 2 bên đang bận queue/session khác) →
  rollback toàn bộ, trả `MATCHING_INVITE_ACCEPT_USER_BUSY` (409), **invite giữ nguyên `pending`**
  để thử lại sau (không mất lượt, không tự huỷ invite).
- **`canPair` (block/report)**: re-check TẠI THỜI ĐIỂM accept, không chỉ lúc tạo invite — block
  có thể phát sinh SAU khi mời, TRƯỚC khi accept. Fail → invite tự chuyển `declined`.
  **Cảnh báo kỹ thuật đã bắt qua test thật**: việc chuyển `declined` và throw lỗi PHẢI ở 2
  transaction khác nhau — throw trong CÙNG transaction vừa ghi `declined` sẽ ROLLBACK luôn phần
  ghi đó (Postgres transaction semantics), khiến invite "giả vờ" báo lỗi nhưng DB vẫn `pending`.
  `InviteService.precheckAccept` chạy transaction riêng, COMMIT xong mới throw ở tầng gọi.
- **KHÔNG check gender preference** lúc accept (khác auto-match) — đây là **consent trực tiếp**:
  invitee chủ động chấp nhận ĐÚNG người này (đã thấy profile ở browse/nearby), không phải anonymous
  auto-pairing cần lọc trước khi biết đối phương là ai. Quyết định thiết kế, không phải thiếu sót.
- **Idempotent** qua `inviteAcceptIdempotencyKey(inviteId, 'inviter'|'invitee')` — accept lặp lại
  (retry mạng, hoặc gọi 2 lần) đọc lại ĐÚNG 2 ticket + session đã tạo, không tạo đôi (docs/05 § 5.10).
- Sau khi tạo, publish CÙNG realtime event `match.matched` mà auto-match dùng — client dùng lại
  đúng 1 chỗ lắng nghe rồi gọi `confirmTicket()` như bình thường, không cần logic riêng cho luồng
  invite. Response `accept` trả kèm `inviteeTicketId` (ticket của chính người gọi) để FE biết
  `ticketId` nào dùng cho `confirmTicket`.

### 9.3 Voice invite KHÔNG tạo Friendship (quyết định chốt 2026-07-14)

`docs/02-domain-model.md` từng mô tả Friendship "tạo ra sau Soul/Voice Match" nhưng **code chỉ
implement rating/like cho `MatchType.Soul`** (`soul-match.service.ts` chặn cứng
`matchType !== Soul`) — gap tài liệu-code có từ trước W4, không phải lỗi phát sinh ở invite.
Quyết định: **giữ nguyên scope code hiện tại** — mời Voice Match chỉ vào cuộc gọi tính phí theo
phút như bình thường, KHÔNG thêm cơ chế like/reveal mới cho Voice. `docs/02` đã sửa lại cho khớp
(chỉ Soul Match có Friendship). Nếu sau này muốn Voice cũng dẫn tới Friendship — đó là một
tính năng mới, cần plan riêng, không phải phần mở rộng ngầm của invite.

### 9.4 Chống spam mời — đối xứng, không phân biệt giới tính trong logic

`MATCHING_INVITE_RATE_LIMIT_PER_HOUR` áp dụng NHƯ NHAU cho mọi user (Redis INCR+EXPIRE+Lua atomic,
`common/redis/rate-limit.ts` — cùng pattern speed-up § 4). Quyết định chốt 2026-07-14: KHÔNG hard-
code ngưỡng khác nhau theo giới tính người nhận (rủi ro pháp lý/đạo đức + khó test) — theo dõi số
liệu report/block phát sinh từ invite theo giới tính sau khi ship, siết thêm bằng cách hạ ngưỡng
chung hoặc thêm setting "ai được mời tôi" ở invitee nếu cần, không đoán hộ trước.

### 9.5 API (`api/v1/matching/invites`)

| Endpoint                             | Mô tả                                                                                                                                                  |
| ------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `POST /matching/invites`             | Tạo invite (`inviteeUserId`, `matchType`) — 409 nếu đã có invite pending tới đúng người, oracle-safe nếu invitee trong hidden-set/không tồn tại/banned |
| `GET /matching/invites`              | Danh sách invite ĐANG CHỜ (pending) gửi tới chính mình, cursor-paginated                                                                               |
| `GET /matching/invites/:id`          | Chi tiết 1 invite — chỉ inviter/invitee xem được                                                                                                       |
| `POST /matching/invites/:id/accept`  | Chấp nhận — xem § 9.2                                                                                                                                  |
| `POST /matching/invites/:id/decline` | Từ chối — chỉ invitee                                                                                                                                  |
| `POST /matching/invites/:id/cancel`  | Huỷ invite đã gửi — chỉ inviter, trước khi có phản hồi                                                                                                 |

### 9.6 Entity + config

`MatchInvite extends BaseAppEntity`: `inviterUserId`, `inviteeUserId`, `matchType`,
`status (enum MatchInviteStatus)`, `expiresAt`, `respondedAt (nullable)`,
`sessionId (nullable, set khi accepted)`. Partial unique index `uq_match_invites_pending_pair
(inviter_user_id, invitee_user_id) WHERE status='pending'` — chặn double-submit ở DB (không phải
cơ chế rate-limit chính, đó là Redis § 9.4).

Config: `MATCHING_INVITE_TTL_SECONDS` (mặc định 3600), `MATCHING_INVITE_RATE_LIMIT_PER_HOUR`
(mặc định 10), `MATCHING_INVITE_SWEEPER_INTERVAL_MS` (mặc định 60000 — `InviteSweeperService`
chỉ housekeeping, KHÔNG phải chốt correctness vì accept/decline/cancel đều tự lazy-expire).
