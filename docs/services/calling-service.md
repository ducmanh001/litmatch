# Calling Service (module trong `core-api`) — voice call 2 người trên LiveKit

> Phạm vi: 2 mục Giai đoạn 2 "Tích hợp SFU cho phòng 2 người" + "Calling module" —
> `CallSession` lifecycle, mint token LiveKit, free-call timer server-enforce, billing theo
> phút (tắt mặc định). **Ngoài phạm vi**: Party Room/multi-party (GĐ3), vận hành LiveKit multi-node,
> luồng "extend call" chủ động trả tiền. SFU đã chốt LiveKit self-host (ADR 0001) —
> `apps/media-server` chỉ là config/deployment, không business logic (docs/03 § 3.3).

## 1. State machine `CallSession`

```
(voice MatchSession confirmed, member gọi join lần đầu)
        │ tạo — unique match_session_id: 1 session = 1 call
        ▼
     pending ──(webhook participant_joined đủ CẢ 2 → startedAt=now)──▶ active
        │                                                               │
        │ ticker: quá CALLING_PENDING_TIMEOUT_SECONDS                   │ end bởi: member gọi end /
        ▼                                                               │ webhook left|room_finished /
     ended(pending_timeout)                                             │ ticker free_limit / thiếu tiền
                                                                        ▼
                                                        ended(completed|free_limit|
                                                              insufficient_balance|pending_timeout)
```

- `ended` là **terminal**; mọi transition idempotent (set-if-null cho joined/started,
  end-if-not-ended) → webhook LiveKit retry/đến trễ/out-of-order không phá state (docs/10
  § Distributed).
- `durationSeconds = endedAt - startedAt` (giờ server core-api — nguồn sự thật thời lượng,
  không tin client lẫn không phụ thuộc LiveKit).
- MỌI nhánh end đều `deleteRoom` LiveKit best-effort (chống leak resource — docs/10
  § Calling); webhook `room_finished` là chốt chiều ngược lại (LiveKit tự đóng phòng rỗng).

## 2. Join & token (docs/10 § 10.1.D)

`POST /calling/match-sessions/:matchSessionId/join`: verify member + `matchType=voice` +
`status=confirmed` (đọc qua `MatchingService.findSessionById` — cùng pattern Soul Match);
upsert `CallSession` (`ON CONFLICT (match_session_id)` lấy call cũ — **re-join sau rớt mạng
hợp lệ** khi call chưa `ended`, trả token MỚI); mint LiveKit access token TTL
`CALLING_TOKEN_TTL_SECONDS`, `identity = userId` từ JWT, room = `call-{callSessionId}` —
client không bao giờ tự chọn room/identity. Call đã `ended` → 409 `CALLING_CALL_ENDED`.
Sau upsert, service đọc lại `MatchSession`: nếu đối phương vừa rời và session đã terminal thì
đóng ngay `CallSession` vừa tạo rồi trả `CALLING_CALL_ENDED`; không được để pending orphan chờ
ticker timeout.

## 3. Webhook LiveKit (`POST /calling/webhooks/livekit`, `@Public` + verify)

Verify chữ ký bằng `WebhookReceiver` (JWT ký bởi API key/secret — pattern verify-rồi-mới-tin
của economy webhooks). Event xử lý: `participant_joined` (ghi `joinedAAt/joinedBAt` theo
identity, đủ 2 → `active` + `startedAt`), `participant_left` + `room_finished` (end
`completed`). Event khác bỏ qua. Room không phải của calling (`call-*`) → bỏ qua.

## 4. Ticker — timer + billing đều ở server (docs/10 § Calling: KHÔNG tin timer client)

`CallTickerService` interval `CALLING_TICKER_INTERVAL_MS`, mỗi tick quét call `pending`/
`active` (index theo status):

- `pending` quá `CALLING_PENDING_TIMEOUT_SECONDS` kể từ `createdAt` → end `pending_timeout`.
- `active`, `CALLING_PRICE_PER_MINUTE_DIAMOND = 0` (default): quá `CALLING_FREE_CALL_SECONDS`
  kể từ `startedAt` → end `free_limit`. Không đụng Economy.
- `active`, price > 0: sau free window, **mỗi phút bắt đầu** trừ diamond **cả 2 bên đối
  xứng** (voice match ngẫu nhiên không có "caller" — quyết định mở § 6) qua
  `EconomyService.spendDiamond` với idempotency `calling:tick:{callId}:{userId}:{minute}` —
  unique DB trên `Transaction` là chốt chặn: 2 ticker instance song song không trừ đôi.
  `WALLET_INSUFFICIENT_BALANCE` ở bất kỳ bên nào → end `insufficient_balance` (phút đã trừ
  không hoàn).
- **Race end-vs-tick** (bug điển hình docs/10): cả tick lẫn end đều `SELECT call FOR UPDATE`
  - re-check `status = active` TRONG transaction; billing chỉ tính phút đã bắt đầu trước
    `endedAt` → không bao giờ trừ tiền sau khi call đã kết thúc.
- `billedMinutes` trên call = số phút đã trừ xong (per-user đối xứng nên 1 con số).

## 5. Realtime & API

End ở bất kỳ nhánh nào → publish `call.ended` `{callId, matchSessionId, reason,
durationSeconds}` cho cả 2 qua kênh `realtime:user:{userId}` (hợp đồng
`@litmatch/common-dtos`, best-effort — polling `GET /calling/calls/:id` là fallback).
Kết thúc call cũng chốt `MatchSession{ended}` ở Matching trong cùng cleanup boundary; từ đó cả
hai user lập tức không còn bị session voice cũ giữ lại để vào queue mới. Khi rời màn trước lúc
CallSession được tạo, endpoint end MatchSession thực hiện cùng cleanup durable.

`POST /calling/calls/:id/like` nhận consent immutable khi call `active` hoặc `ended`; server
khóa `CallSession`, unique reaction theo `(callId, raterUserId)` và chỉ tạo `Friendship` +
`Conversation` trong cùng transaction khi đã có like từ cả hai. Response chỉ trả `friendUserId`
khi mutual để client có thể đi thẳng `/chat/:friendUserId` sau khi người dùng kết thúc call;
double tap/retry không tạo thêm bạn hay conversation.

| Endpoint                                | Mô tả                                                                           |
| --------------------------------------- | ------------------------------------------------------------------------------- |
| `POST /calling/match-sessions/:id/join` | Tạo/lấy call + mint token (idempotent tự nhiên theo unique session)             |
| `GET /calling/calls/:id`                | Trạng thái call (poll fallback) — chỉ member                                    |
| `POST /calling/calls/:id/end`           | Member chủ động kết thúc                                                        |
| `POST /calling/calls/:id/like`          | Like immutable khi call `active`/`ended`; mutual like tạo Friend + Conversation |
| `POST /calling/match-sessions/:id/end`  | Rời Voice Match, đóng cả session kể cả khi chưa tạo call                        |
| `POST /calling/webhooks/livekit`        | Webhook LiveKit — `@Public` + verify chữ ký                                     |

## 6. Config (Joi + `.env.example`) & quyết định mở

`LIVEKIT_URL` (ws URL client nối), `LIVEKIT_API_KEY/SECRET` (khớp
`livekit.yaml`; dev = devkey), `CALLING_FREE_CALL_SECONDS` (default 420 — docs/06 ~7 phút),
`CALLING_PRICE_PER_MINUTE_DIAMOND` (default **0** = free + tự end), `CALLING_PENDING_TIMEOUT_SECONDS`
(default 60), `CALLING_TICKER_INTERVAL_MS` (default 1000), `CALLING_TOKEN_TTL_SECONDS` (default 120).

Khi test điện thoại, `LIVEKIT_URL` phải là `wss://` public, không phải `ws://localhost`; còn
`LIVEKIT_API_URL` của core-api vẫn là DNS nội bộ tới SFU. Tunnel HTTP chỉ giải quyết signaling,
không thay được đường media WebRTC: môi trường public phải expose ICE UDP (hoặc ICE/TCP) và
TURN/TLS theo cấu hình SFU; nếu không hai thiết bị khác mạng có thể vào room nhưng không có tiếng.

Quyết định mở đã chọn default (đổi không phá schema): (a) billing đối xứng cả 2 bên;
(b) phút lẻ đã bắt đầu tính trọn phút; (c) không tự hoàn tiền khi call end sớm — hoàn tiền
lỗi hệ thống là bút toán đảo thủ công có audit (docs/06), làm khi có luồng CS; (d) **biên
bất đối xứng chấp nhận**: trong 1 phút, bên A có thể đã bị trừ trước khi phát hiện bên B
hết tiền → call end, phút đó không hoàn cho A (giá trị 1 phút, tránh phức tạp 2-phase/đảo
bút toán tự động — có ledger đầy đủ để CS xử lý khiếu nại).
