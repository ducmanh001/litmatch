# Party Room Service (module trong `core-api`) — đặc tả chi tiết

> Giai đoạn 3 ([07-roadmap.md](../07-roadmap.md)). Module `apps/core-api/src/modules/party-room`.
> Phòng audio multi-user trên LiveKit (ADR 0001), role host/speaker/audience, giới hạn cứng
> speaker theo config ([03-architecture.md § 3.8.A](../03-architecture.md) — consumer tăng N×(N-1)).

## 1. Mô hình dữ liệu

- `party_rooms`: host, title, `status` (`active|closed`), **`speaker_limit` snapshot config lúc
  tạo** (đổi config không retro phòng đang sống), `close_reason` (`host_left|finished|swept|error`).
- `party_room_members`: membership theo row, active = `left_at IS NULL`; rejoin sau khi rời tạo
  ROW MỚI (giữ lịch sử). Bất biến ở DB (partial unique index, migration `1752700000000`):
  - `uq_party_members_active_room_user`: 1 membership active/(room, user).
  - `uq_party_members_active_user`: **1 user chỉ ở 1 phòng active** toàn hệ thống (cùng tinh thần
    "1 user 1 queue matching" của [06-domain-rules.md](../06-domain-rules.md)).

## 2. Role & quyền media — enforce ở SFU, không tin client

- Token join mint server-side, identity = userId, room name = `party-{roomId}` (client không tự chọn).
- `audience`: token `canPublish=false` — **tự unmute bị chặn ở tầng LiveKit**, không chỉ UI
  ([10 § Party Room](../10-code-review-checklist.md)). `host`/`speaker`: `canPublish=true`.
- Cấp/thu speaker (CHỈ host — [06-domain-rules.md](../06-domain-rules.md)) đổi grant runtime qua
  `RoomService.updateParticipant` và **đợi ACK trong cùng DB transaction**: SFU fail → rollback role
  DB (không bao giờ DB nói `audience` mà SFU vẫn cho publish); participant không nối → coi như xong
  (không nối thì không publish được, token lần sau lấy role từ DB).
- `speaker_limit` đếm role `speaker` (host là publisher mặc định, không chiếm slot).

## 3. Concurrency

- MỌI thay đổi state phòng (join/leave/đổi role/close) serialize qua `SELECT ... FOR UPDATE` trên
  row `party_rooms` — 1 row làm điểm tuần tự hoá, cùng pattern `tryPair` của Matching. Race
  "2 request xin speaker đồng thời" ([10 § Party Room](../10-code-review-checklist.md)): đếm speaker
  DƯỚI lock, bên sau thấy count đã tăng → `PARTY_SPEAKER_LIMIT_REACHED`.
- Join: đếm member active dưới lock so `PARTY_MAX_MEMBERS`; LiveKit `maxParticipants` (set lúc
  createRoom) là chốt chặn thứ 2 ở tầng SFU.
- 1-user-1-phòng: chốt chặn cuối là partial unique index (không phải check-rồi-insert).

## 4. Lifecycle & phòng vô chủ

- Tạo phòng: row phòng + membership host ATOMIC trong 1 transaction → tạo LiveKit room TƯỜNG MINH
  (`maxParticipants`, `emptyTimeout`) → mint token host. SFU fail → compensate đóng phòng (`error`) + 503.
- **Host rời CHỦ ĐỘNG qua REST `leaveRoom` → ĐÓNG PHÒNG NGAY** (`host_left`): quyết định GĐ3 —
  chọn "đóng phòng" thay vì transfer host ([10 § Party Room](../10-code-review-checklist.md) cho phép
  1 trong 2); transfer host là mở rộng sau nếu nghiệp vụ cần, đổi thì sửa spec này trước.
- **Host rớt kết nối NGOÀI Ý MUỐN qua webhook `participant_left` → CHỜ GRACE, KHÔNG đóng ngay**
  (bổ sung sau khi test tay bắt được: reload trang/rớt wifi thoáng qua của host đá cả phòng ra
  ngay, trải nghiệm kém cho app audio/social trên di động). `handleParticipantLeft` chỉ set
  `party_rooms.host_disconnected_at = now()` dưới lock (idempotent — webhook lặp lại không dời
  mốc), KHÔNG mark membership host rời — host vẫn active để `joinRoom` nhận ra là rejoin, không
  tạo membership mới. Host tự kết nối lại (REST `join`) trong lúc chờ → `joinRoom` clear
  `host_disconnected_at` về null, CÙNG lock row với grace-check nên không có race đóng nhầm phòng
  vừa hồi phục. Hết `PARTY_HOST_DISCONNECT_GRACE_SECONDS` (mặc định 15s) mà vẫn không null →
  `PartyRoomSweeperService` (interval riêng `PARTY_HOST_GRACE_CHECK_INTERVAL_MS`, mặc định 5s —
  ngắn hơn nhiều sweeper chính 30s vì đây là backstop CHÍNH cho case "phòng còn member khác") gọi
  `closeRoomById(..., guard)` với `guard` re-check `host_disconnected_at` NGAY TRÊN row đã lock —
  đóng với lý do `host_left` như cũ. Publish `party.host.disconnected`/`party.host.reconnected`
  (best-effort, chỉ gợi ý refetch — REST poll field `hostDisconnectedAt` vẫn là nguồn sự thật) cho
  member khác hiện banner "Host đang mất kết nối".
- Member thường rời qua REST: nhả membership + `removeParticipant` khỏi SFU (DB rời mà SFU còn nối
  là lệch state); rớt kết nối: webhook `participant_left` nhả membership (UPDATE có điều kiện
  `left_at IS NULL` — retry idempotent), vào lại = join lại.
- Đóng phòng idempotent (`closeRoomById` — endpoint/webhook/sweeper cùng đi qua): chỉ lời gọi thực
  hiện transition mới dọn SFU + publish realtime (retry không bắn đôi). Tham số `guard` tuỳ chọn
  đánh giá trên row đã lock TRONG CÙNG transaction — dùng cho grace-check host disconnect ở trên.

## 5. Webhook LiveKit

- `POST /party/webhooks/livekit` — `@Public` nhưng verify chữ ký JWT (API key/secret) trên NGUYÊN VĂN
  body trước khi tin; sai chữ ký → 401 (cùng pattern calling).
- LiveKit cấu hình NHIỀU webhook URL (calling + party — `apps/media-server/livekit.yaml`); mỗi
  controller lọc theo prefix room của mình (`call-*` / `party-*`), event lạ bỏ qua sau khi verify.
- Xử lý idempotent với retry/out-of-order: mọi transition no-op khi state đã terminal.

## 6. Sweeper — backstop khi webhook rớt

Webhook KHÔNG được là đường duy nhất đóng phòng. `PartyRoomSweeperService` mỗi
`PARTY_SWEEPER_INTERVAL_MS` quét phòng `active` già hơn `PARTY_STALE_ROOM_SECONDS`, đóng (`swept`) khi:

1. Không còn member active trong DB, hoặc
2. Room không còn trên SFU (đối chiếu `roomExists` — DB còn member nhưng SFU đã empty-timeout vì mọi
   webhook rớt). SFU API lỗi → bỏ qua phòng đó, tick sau thử lại (không đóng oan).

- LiveKit `emptyTimeout` (`PARTY_EMPTY_ROOM_TIMEOUT_SECONDS`) là backstop thứ 3 ở tầng SFU.
- Stateless — chạy nhiều instance an toàn (closeRoomById idempotent dưới lock).

## 7. Config (env — [.env.example](../../.env.example))

`PARTY_MAX_SPEAKERS` (giới hạn CỨNG § 3.8.A, chỉ nới sau load test đúng workload + headroom),
`PARTY_MAX_MEMBERS`,
`PARTY_TOKEN_TTL_SECONDS`, `PARTY_EMPTY_ROOM_TIMEOUT_SECONDS`, `PARTY_SWEEPER_INTERVAL_MS`,
`PARTY_STALE_ROOM_SECONDS`, `PARTY_TITLE_MAX_LENGTH`,
`PARTY_HOST_DISCONNECT_GRACE_SECONDS` (mặc định 15 — § 4), `PARTY_HOST_GRACE_CHECK_INTERVAL_MS`
(mặc định 5000). LiveKit dùng chung `LIVEKIT_URL/API_KEY/API_SECRET`
với calling (1 cụm LiveKit — đổi tên từ `CALLING_LIVEKIT_*` ở GĐ3).

## 8. Realtime

Fanout per-user channel hiện có `realtime:user:{userId}` cho từng member active — gateway giữ
zero-logic, KHÔNG thêm room channel ([realtime-gateway.md](./realtime-gateway.md)); chuyển sang room
channel chỉ khi số liệu fanout ép (GĐ6/7). Event: `party.member.joined`, `party.member.left`,
`party.role.changed`, `party.room.closed` (+ `gift.sent` từ Gift). Publish luôn SAU commit, best-effort
(client còn REST polling: `GET /party/rooms/:id`).

## 9. Public API cho module khác

`PartyRoomService.getActiveRoomMembers(roomId)` — Gift dùng validate người tặng/nhận cùng phòng
active + lấy danh sách fanout ([gift-service.md](./gift-service.md)). Export qua `index.ts`.
