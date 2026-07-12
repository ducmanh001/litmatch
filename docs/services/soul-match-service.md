# Soul Match Service (module trong `core-api`) — đặc tả slice M2: chat ẩn danh + rating + Friendship

> Phạm vi file này: mục "Soul Match" của Giai đoạn 2 (`docs/07-roadmap.md`) — phòng chat text
> ẩn danh tạm thời gắn `MatchSession`, rating 2 chiều `rude|boring|like`, cả 2 `like` → tạo
> `Friendship` + unlock profile. **Ngoài phạm vi slice**: realtime push qua Signaling Gateway
> (mục roadmap kế tiếp — xem § 7), Friend Chat 1-1 (`Conversation`/`Message`), Safety module,
> trust-score event.

## 1. Vòng đời phòng chat — derive-khi-đọc, không cột state riêng

Phòng chat KHÔNG có entity riêng: nó là **view dẫn xuất** từ `MatchSession`
(`matchType = soul`, `status = confirmed`) + 2 config thời lượng. Phase derive từ giờ server
tại thời điểm đọc (cùng pattern "derive khi đọc, không phụ thuộc cron" của VIP; timer enforce
ở server — docs/10 § Calling: không bao giờ tin timer client):

```
confirmedAt = max(confirmedAAt, confirmedBAt)   // thời điểm cả 2 đã confirm
chatEndsAt   = confirmedAt + SOUL_CHAT_DURATION_SECONDS
ratingEndsAt = chatEndsAt  + SOUL_RATING_WINDOW_SECONDS

now < chatEndsAt              → phase = chatting   (gửi + đọc message, rate được)
chatEndsAt ≤ now < ratingEndsAt → phase = rating   (chat khoá, chỉ rate + đọc)
now ≥ ratingEndsAt            → phase = closed     (khoá hết — docs/02: chat ẩn danh
                                                    khoá khi session kết thúc)
```

Quyết định đã chốt (đổi được bằng config/slice sau, không phá schema):

- Không có API "end chat sớm" — hết giờ tự đóng; muốn thoát thì ngừng chat và rate.
- Rating mở **từ khi phòng mở** (rate sớm ngay trong lúc chat là hợp lệ) đến hết
  `ratingEndsAt`.
- Sau `closed` không đọc lại history (Friend Chat 1-1 sau này là kênh mới, bảng mới) —
  message giữ trong DB làm bằng chứng cho Report/T&S (Giai đoạn 4), không expose lại qua API.
- Session `expired` (thiếu confirm) không bao giờ có phòng chat.

## 2. Ẩn danh (docs/01 #1)

- Message DTO chỉ trả `senderRole ∈ me|partner` — **không bao giờ** trả userId/nickname/avatar
  đối phương trước khi match.
- Session DTO chỉ trả `myVerdict` + `matched: boolean` — **không leak verdict đối phương**
  (biết mình bị rate "rude" theo thời gian thực là vector harassment ngược).
- Profile đối phương chỉ qua `GET /soul-match/sessions/:id/partner`, guard bằng
  `FriendService.areFriends` (nguồn sự thật unlock = Friendship tồn tại).

## 3. Rating & Friendship — điểm nhạy race duy nhất của module

- `SoulMatchRating`: unique DB `(session_id, rater_user_id)` — 1 người 1 verdict/session,
  **immutable**: replay cùng verdict → trả kết quả cũ (idempotent), khác verdict → 409
  `SOUL_MATCH_RATING_CONFLICT`. Không nhận Idempotency-Key riêng — cặp khoá tự nhiên đã là
  idempotency đúng nghĩa.
- **2 rating `like` song song** (READ COMMITTED, mỗi transaction không thấy insert chưa commit
  của bên kia → cả 2 cùng "chưa đủ 2 like" → không ai tạo Friendship): chống bằng
  `SELECT session FOR UPDATE` **trước** insert rating — serialize 2 rater trên session row
  (cùng pattern lock session → ticket của `confirmTicket`). Check mutual + tạo Friendship
  nằm trong **cùng transaction** với insert rating.
- `Friendship` thuộc **module `friend`** (chủ sở hữu dữ liệu — Friend Chat 1-1 sau này xây
  tiếp trên module này): cột canonical `userLowId < userHighId` + unique
  `(user_low_id, user_high_id)`; `ensureFriendship` idempotent (ON CONFLICT DO NOTHING) —
  cặp cũ match lại lần 2 không vỡ. Soul-match gọi qua DI, truyền `EntityManager` để tham gia
  transaction (docs/03 § 3.7 — cùng process, cùng DB).

## 4. Message

- `SoulChatMessage` append-only: `sessionId`, `senderUserId`, `content`
  (`1..SOUL_CHAT_MESSAGE_MAX_LENGTH`, plain text), `idempotencyKey` unique prefix
  `soul:msg:{userId}:{key}` (pattern matching M1) — client retry không nhân đôi message;
  replay trả lại message cũ.
- Gửi: guard membership (IDOR docs/10 § 10.1.D) + phase `chatting` + re-check
  `UserStatus.Banned` tại thời điểm gửi (§ 10.0.C — ban giữa chừng phải cắt ngay).
- Đọc: cursor pagination chuẩn `@litmatch/common-dtos` (`buildCursorPage`), phase
  `chatting|rating`.

## 5. API (`api/v1/soul-match`)

| Endpoint                                 | Idempotency-Key | Mô tả                                                                     |
| ---------------------------------------- | --------------- | ------------------------------------------------------------------------- |
| `GET /soul-match/sessions/:id`           | không           | Phase + deadline + `myVerdict` + `matched` (poll)                         |
| `GET /soul-match/sessions/:id/messages`  | không           | List message, cursor, `senderRole` ẩn danh                                |
| `POST /soul-match/sessions/:id/messages` | có              | Gửi message — chỉ phase `chatting`                                        |
| `POST /soul-match/sessions/:id/rating`   | không (§ 3)     | Verdict `rude\|boring\|like` — cả 2 `like` → Friendship, cùng transaction |
| `GET /soul-match/sessions/:id/partner`   | không           | Profile đối phương — 403 khi chưa match                                   |

Mọi endpoint: 404 nếu session không tồn tại **hoặc không phải thành viên** (không phân biệt
— tránh oracle dò sessionId), 409 nếu phòng chưa mở/đã đóng theo phase.

## 6. Config (Joi + `.env.example`)

`SOUL_CHAT_DURATION_SECONDS` (mặc định 150 — docs/06: 2-3 phút), `SOUL_RATING_WINDOW_SECONDS`
(mặc định 120), `SOUL_CHAT_MESSAGE_MAX_LENGTH` (mặc định 500).

## 7. Realtime (đã có — xem [realtime-gateway.md](./realtime-gateway.md))

Gửi message vẫn đi REST vào core-api (business + persist ở core-api); sau commit, core-api
publish Redis pub/sub theo **channel người nhận** `realtime:user:{userId}` (payload tính sẵn
per-recipient — `senderRole` đã là `me|partner`, không leak userId); gateway chỉ verify JWT và
fanout, không business logic (docs/03 § 3.3). Best-effort: publish fail → client vẫn còn REST
polling. Event: `soul.message` (message mới, không bắn lại khi replay idempotency) và
`soul.matched` (mutual like MỚI tạo Friendship). Hợp đồng: `@litmatch/common-dtos`
`realtime-events.ts`.
