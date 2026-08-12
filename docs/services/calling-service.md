# Calling Service (module trong `core-api`) — voice call 2 người trên LiveKit

> Phạm vi: 2 mục Giai đoạn 2 "Tích hợp SFU cho phòng 2 người" + "Calling module" —
> `CallSession` lifecycle, mint token LiveKit và timer Voice Match server-enforce. Voice Match
> luôn tối đa 7 phút cho mọi tier; không có gia hạn/gói phút/tính Diamond theo phút. **Ngoài phạm vi**:
> Party Room/multi-party (GĐ3), vận hành LiveKit multi-node. SFU đã chốt LiveKit self-host (ADR 0001) —
> `apps/media-server` chỉ là config/deployment, không business logic (docs/03 § 3.3).

## 1. State machine `CallSession`

```
(voice MatchSession confirmed, member gọi join lần đầu)
        │ tạo — unique match_session_id: 1 session = 1 call
        ▼
     pending ──(webhook participant_joined đủ CẢ 2 → startedAt=now)──▶ active
        │                                                               │
        │ ticker: quá CALLING_PENDING_TIMEOUT_SECONDS                   │ member gọi end
        ▼                                                               │
     ended(pending_timeout)                                             │ participant rời/connection abort/
                                                                        │ room_finished → reconnect grace
                                                                        │ (timer tạm dừng), quá grace mới end
                                                                        ▼
                                                        ended(completed|free_limit|pending_timeout)
```

- `ended` là **terminal**; mọi transition idempotent (set-if-null cho joined/started,
  end-if-not-ended) → webhook LiveKit retry/đến trễ/out-of-order không phá state (docs/10
  § Distributed).
- `durationSeconds = endedAt - startedAt` (giờ server core-api — nguồn sự thật thời lượng,
  không tin client lẫn không phụ thuộc LiveKit); khoảng reconnect grace được loại khỏi
  `startedAt`.
- MỌI nhánh end đều `deleteRoom` LiveKit best-effort (chống leak resource — docs/10
  § Calling); `room_finished` chỉ mở reconnect grace khi call còn active, còn webhook đến sau
  khi call đã ended là retry/no-op.

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
identity, đủ 2 → `active` + `startedAt`), `participant_left` /
`participant_connection_aborted` / `room_finished` (mở reconnect grace). Khi cả hai quay lại,
timer tiếp tục; quá grace mới end `completed`. Event khác bỏ qua. Room không phải của calling
(`call-*`) → bỏ qua.

`GET /calling/calls/:id` có backstop đối soát bằng `RoomServiceClient.listParticipants`: nếu
webhook bị mất, mọi identity member đang thật sự có mặt sẽ được ghi nhận như
`participant_joined` (không phụ thuộc browser bên kia có đang poll); khi call đã `active` mà đối
phương không còn trong LiveKit, API chốt `ended(completed)`. Client không được tự gửi cờ
`active`/`joined`; identity đối soát lấy từ JWT và participant LiveKit.

## 4. Ticker — timer ở server (docs/10 § Calling: KHÔNG tin timer client)

`CallTickerService` interval `CALLING_TICKER_INTERVAL_MS`, mỗi tick chỉ lấy `id` theo batch:
`pending` dùng index `(status, created_at)`, còn `active` dùng partial index
`(updated_at, id) WHERE status='active'` để không sort/quét toàn bộ tập call đang sống:

- `pending` quá `CALLING_PENDING_TIMEOUT_SECONDS` kể từ `createdAt` → end `pending_timeout`.
- `active` có participant bị mất kết nối: trong `CALLING_RECONNECT_WINDOW_SECONDS` (default
  30s), timer tạm dừng. Cả hai quay lại thì dời mốc `startedAt` qua đoạn gián đoạn; quá grace
  thì end `completed`.
- `active` Voice Match quá `CALLING_FREE_CALL_SECONDS = 420` giây kể từ `startedAt` (đã loại
  trừ reconnect grace) → end `free_limit`. Không gọi Economy, không trừ Diamond.
- `Friend` call không đi qua free timer; hai người đã mutual-like có thể gọi lại lâu dài.
- **Race end-vs-tick** vẫn dùng lock + re-check `status = active`, bảo đảm không end/cleanup đôi.

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

`GET /calling/calls/:id` cũng trả `liked`, `matched`, `friendUserId` đọc từ DB để trạng thái nút
tim được giữ sau refetch/reload; trước mutual like `friendUserId` luôn là `null`.

| Endpoint                                   | Mô tả                                                                           |
| ------------------------------------------ | ------------------------------------------------------------------------------- |
| `POST /calling/match-sessions/:id/join`    | Tạo/lấy call + mint token (idempotent tự nhiên theo unique session)             |
| `POST /calling/friends/:friendUserId/join` | Tạo/lấy friend call sau mutual-like; không giới hạn 7 phút                      |
| `GET /calling/calls/:id`                   | Trạng thái call (poll fallback) — chỉ member                                    |
| `POST /calling/calls/:id/end`              | Member chủ động kết thúc                                                        |
| `POST /calling/calls/:id/like`             | Like immutable khi call `active`/`ended`; mutual like tạo Friend + Conversation |
| `POST /calling/match-sessions/:id/end`     | Rời Voice Match, đóng cả session kể cả khi chưa tạo call                        |
| `POST /calling/webhooks/livekit`           | Webhook LiveKit — `@Public` + verify chữ ký                                     |

## 6. Config (Joi + `.env.example`) & quyết định mở

`LIVEKIT_URL` (ws URL client nối), `LIVEKIT_API_KEY/SECRET` (khớp
`livekit.yaml`; dev = devkey), `CALLING_FREE_CALL_SECONDS` (default 420 — đúng 7 phút),
`CALLING_PENDING_TIMEOUT_SECONDS`
(default 60), `CALLING_RECONNECT_WINDOW_SECONDS` (default 30), `CALLING_TICKER_INTERVAL_MS`
(default 1000), `CALLING_TOKEN_TTL_SECONDS` (default 120).

Khi test điện thoại, `LIVEKIT_URL` phải là `wss://` public, không phải `ws://localhost`; còn
`LIVEKIT_API_URL` của core-api vẫn là DNS nội bộ tới SFU. Tunnel HTTP chỉ giải quyết signaling,
không thay được đường media WebRTC: môi trường public phải expose ICE UDP (hoặc ICE/TCP) và
TURN/TLS theo cấu hình SFU; nếu không hai thiết bị khác mạng có thể vào room nhưng không có tiếng.

Quyết định sản phẩm: mọi Voice Match đều kết thúc ở mốc 7 phút, không phân biệt regular/VIP/SVIP.
Nếu hai bên mutual-like, server tạo `Friendship` + `Conversation` atomically; từ đó gọi qua
`/calling/friends/:friendUserId/join` là friend call bền vững, không dùng `MatchSession` và không
đi qua quota/thời lượng Voice Match. Nếu không mutual-like, Voice Match kết thúc là chấm dứt
quan hệ ẩn danh; không có đường gọi lại friend.
