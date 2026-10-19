# Movie Match Service (module `movie-match` trong `core-api`) — xem chung video đồng bộ

> Phạm vi: mục "Movie Match: đồng bộ playback qua WebSocket" — Giai đoạn 5
> ([07-roadmap.md](../07-roadmap.md)). `MovieSession` (docs/02): video url, playback position, 2
> participant. **Ngoài phạm vi**: xử lý stream video thật (chỉ đồng bộ URL YouTube + vị trí phát,
> không proxy/transcode video — docs/01 #4), chat riêng cho Movie Match (tái dùng `Conversation`
> của [friend-service.md](./friend-service.md)), SFU/LiveKit (không liên quan — đây không phải
> voice/video call).

## 1. Vì sao KHÔNG tái dùng Party Room/Calling

Movie Match trông giống "2 người trong 1 phòng" như Calling/Party Room nhưng khác bản chất:
không có SFU, không có tiền, không có billing theo phút. Media thật (video) do **client tự phát
trực tiếp từ YouTube**, server chỉ giữ **1 nguồn sự thật cho state phát** (url, vị trí, đang
play/pause) và fan-out state đó cho người còn lại — tương tự "shared remote control", không phải
media pipeline. Vì vậy module này độc lập hoàn toàn, chỉ phụ thuộc `friend` (quan hệ + chat) và
`realtime-gateway` (fan-out) đã có sẵn.

## 2. Quan hệ bắt buộc: chỉ giữa 2 người đã là bạn

`MovieSession` chỉ tạo được giữa 2 user có `Friendship` (kiểm tra qua `FriendService`, cùng pattern
canonical `userLowId < userHighId`) — **không tự chế thêm quan hệ "được mời xem chung" riêng**.
Lý do: tính năng là "vừa xem vừa chat" (docs/01 #4), 2 người bạn đã có sẵn `Conversation` để chat;
dựng thêm 1 khái niệm quan hệ mới cho riêng Movie Match là trùng lặp không cần thiết (docs/11).
Chat trong lúc xem **đi thẳng qua** `POST/GET /conversations/:id/messages` đã có, module này không
thêm entity message nào.

## 3. Mô hình dữ liệu

`movie_sessions`: `userLowId`/`userHighId` (canonical, cùng cặp `Friendship`), `videoUrl`
(whitelist domain `youtube.com`/`youtu.be` — server validate bằng `new URL()` + so khớp hostname
chính xác/subdomain thật, KHÔNG substring match, chặn bypass kiểu `youtube.com.evil.com`),
`positionSeconds` (numeric, nguồn sự thật vị trí phát), `isPlaying` (boolean),
`positionUpdatedAt` (server timestamp — dùng để client nội suy vị trí hiện tại khi `isPlaying`,
không tin đồng hồ client), `status` (`active|ended`), `endedAt`, `endReason` (`left` — giá trị duy
nhất được set ở bản này; enum còn chừa `replaced` cho mở rộng sau, hiện chưa có code path nào set
giá trị đó vì tạo session cho đúng cặp đang active luôn trả lại session cũ idempotent, không có
tình huống "thay thế"). **Không có bảng message riêng** — xem § 2.

Bất biến ở DB: **KHÔNG dùng 2 partial unique index đơn cột trên `userLowId`/`userHighId`** — kỹ
thuật đó không đủ, vì 1 user có thể là `userLowId` ở session A và `userHighId` ở session B cùng
lúc, mỗi index đơn cột không thấy xung đột chéo cột (bug bị bắt bằng integration test race trước
khi merge). Enforce đúng bằng bảng phụ `movie_session_active_participants` (PK `userId` — 1 dòng/
user khi đang có session active), ghi/xoá 2 dòng (low, high) **cùng transaction** với tạo/kết thúc
`MovieSession` (`MovieMatchService.createSession`/`endSession`) — cùng tinh thần "1 user 1 queue
matching"/"1 user 1 phòng party" đã áp dụng ở các module trước, nhưng kỹ thuật DB khác vì quan hệ
ở đây là cặp 2 chiều thay vì 1 cột user duy nhất. Tạo session mới khi đang có session active với
**cùng cặp bạn đó** → trả lại session cũ (idempotent, không tạo trùng); tạo với **cặp bạn khác**
trong khi đang active với cặp hiện tại → 409 `MOVIE_SESSION_ALREADY_ACTIVE` (không tự ý kết thúc
session cũ thay user).

## 4. Playback state — KHÔNG áp lock kiểu ledger

Đây là state UX ephemeral, không phải dữ liệu tài chính — sai lệch vài giây giữa 2 client là chấp
nhận được (docs/10 § Movie Match). `PATCH /movie-match/sessions/:id/state` (chỉ 1 trong 2
participant) ghi đè `positionSeconds`/`isPlaying`/`positionUpdatedAt = now()` bằng 1 câu `UPDATE`
đơn giản (last-write-wins, không `SELECT ... FOR UPDATE`), rồi publish realtime cho người còn lại.
Không cần idempotency key (thao tác không sinh side-effect tiền/không thể "chồng" giá trị). Client
tự nội suy vị trí hiện tại giữa 2 lần cập nhật bằng `positionSeconds + (now - positionUpdatedAt)`
khi `isPlaying = true`.

## 5. Lifecycle

1. `POST /movie-match/sessions` (`friendUserId`, `videoUrl`) — verify bạn bè qua
   `FriendService.areFriends` (404 nếu không phải bạn, cùng mã lỗi cho "không tồn tại"/"không phải
   bạn" — không oracle); tạo `MovieSession` `active` nếu chưa có, trả lại session cũ nếu đã active
   đúng cặp (idempotent — xem § 3, không có nhánh "replace" vì trạng thái active-đúng-cặp luôn
   được bắt trước khi chạm bảng participant).
2. `PATCH /movie-match/sessions/:id/state` — cập nhật playback, publish `movie.state.changed`.
3. `POST /movie-match/sessions/:id/end` — 1 trong 2 bên chủ động kết thúc (`left`, idempotent —
   gọi lại trên session đã `ended` là no-op); giải phóng bảng participant trong cùng transaction
   để cả 2 user có thể mở phiên xem chung mới (với bất kỳ ai) ngay sau đó.
4. `GET /movie-match/sessions/:id` — poll fallback (cùng payload dùng cho realtime).
5. **Không có ticker/timer** — khác Calling, không có free-limit hay billing nên không cần tick
   nền; session chỉ kết thúc do hành động chủ động (không tự hết hạn theo thời gian ở bản này).

## 6. IDOR & lỗi

Mọi endpoint theo `movieSessionId` chỉ chấp nhận khi caller là 1 trong 2 participant — không tồn
tại **hoặc** không phải thành viên đều trả cùng 404 `MOVIE_SESSION_NOT_FOUND` (cùng pattern Friend
Chat/Soul Match, docs/10 § 10.1.D). Session đã `ended` → 409 `MOVIE_SESSION_ENDED` khi thao tác
state.

## 7. Realtime (tái dùng hạ tầng — [realtime-gateway.md](./realtime-gateway.md))

Event mới trong `@litmatch/common-dtos` `realtime-events.ts`: `movie.session.started`,
`movie.state.changed`, `movie.session.ended` — publish cho cả 2 participant qua
`realtime:user:{userId}` sau khi ghi DB (best-effort, `GET /movie-match/sessions/:id` là fallback
polling).

## 8. Config (Joi + `.env.example`)

`MOVIE_MATCH_URL_MAX_LENGTH` (mặc định 2048), `MOVIE_MATCH_ALLOWED_VIDEO_HOSTS` (mặc định
`youtube.com,youtu.be`, danh sách phân tách dấu phẩy — validate `videoUrl` phải khớp 1 trong các
host này).

## 9. Flow ghép ẨN DANH (movie-match.html) — bổ sung 2026-07-16

Ngoài phiên xem chung giữa bạn bè (§ 2-5), Movie Match có flow ghép người lạ theo đúng 4 màn
mockup: search → watch → rating → result. Plan chi tiết + bảng giả định:
`docs/plans/2026-07-15-ui-contract-completion.md § Movie Match ghép ẩn danh`.

- **Queue/matcher**: `movie_match_queue_entries` (PK user_id, index `idx_movie_match_queue_order` theo `(queued_at, user_id)`) +
  PK `movie_session_active_participants.user_id` — cùng kỹ thuật Palm Match. `SafetyService.canPair` re-check ĐÚNG LÚC ghép
  và chạy trên CHÍNH transaction đó (không mượn thêm kết nối pool).
  **Không có khoá toàn cục** (ADR 0013 / plan 2026-10-17 § 7a): quy tắc "người MỚI hơn giành người CŨ HƠN" — mỗi lượt
  `tryMatchAnon` chọn entry cũ nhất còn rảnh và cũ hơn mình bằng `FOR UPDATE SKIP LOCKED` (không bao giờ chờ nên không
  deadlock), rồi xoá entry của chính mình để chốt; nếu lúc đó một lượt mới hơn đang giành mình thì DELETE chờ nó commit
  và lượt này nhả đối tác. Mọi cạnh chờ đi từ cũ sang mới nên không có chu trình. Không khoá hàng của chính mình trong
  lúc tìm (nếu khoá thì cả hàng đợi poll cùng lúc sẽ bỏ qua nhau và không ai ghép được). Hai người vào cùng lúc có thể
  bỏ lỡ nhau vì đối tác đang bị khoá; `getAnonCurrent` của người đang queued thử ghép lại nên lượt poll kế tiếp ghép
  được. Entry quá hạn được dọn mỗi lượt join (tối đa 50 hàng, `SKIP LOCKED`).
  **Hai lượt join của CÙNG một user** (bấm đúp, hai tab) được tuần tự hoá bằng khoá advisory THEO USER (`pg_advisory_xact_lock`,
  lấy đầu transaction, không toàn cục): thiếu nó, lượt thứ hai đọc "chưa active" trước khi lượt đầu commit rồi chèn lại entry sau
  khi user đã được ghép — trả `queued` cho user đã active và để lại entry thừa. Khoá chỉ giữ một khoá mỗi transaction và lấy
  TRƯỚC mọi khoá khác nên không tạo chu trình chờ; lượt sau chờ rồi trả đúng phiên vừa ghép.
  **Giới hạn còn lại:** FIFO chính xác khi tuần tự, xấp xỉ khi đồng thời; hàng đợi vẫn ở Postgres (mỗi lượt poll của
  người đang chờ chạy ≥2 câu lệnh); khi số đo thật cho thấy Postgres là nút thắt thì chuyển hàng đợi sang Redis shard
  như Matching chính. Không chia khoá theo bucket trước khi có tiêu chí ghép (vùng/tuổi) vì bucket tuỳ ý chỉ làm hai
  người không bao giờ gặp nhau.
- **Session**: tái dùng `movie_sessions` với cột additive `mode`
  (`friend|anonymous`), `expires_at` (deadline, lazy expiry → mở phase rating),
  `watch_ended_at` ("Kết thúc"/hết giờ), `low_rating`/`high_rating`
  (`like|boring|rude`), `outcome` (`matched|not_matched|cancelled|expired`). Video do SERVER
  chọn từ `MOVIE_MATCH_ANON_VIDEO_URLS` — client không gửi URL.
- **Ẩn danh**: bộ endpoint riêng `/movie-match/anon/*` trả state view role-relative;
  `partnerUserId` CHỈ xuất hiện khi `outcome=matched`. KHÔNG dùng `MovieSessionDto`
  (DTO đó expose partnerUserId — đúng cho friend mode, sai cho ẩn danh).
- **Rating**: mỗi bên một lần (khác giá trị → 409); non-like → terminal `not_matched` ngay;
  mutual-like → `FriendService.ensureFriendship(source=movie_match)` CÙNG transaction — cùng
  bất biến Soul/Palm Match. Rating chỉ mở sau `watch_ended_at` (409 `RATING_NOT_OPEN` trước đó).
- **Chat**: `movie_session_messages` append-only theo session (2 người CHƯA là bạn — không có
  Conversation), Idempotency-Key unique DB, cursor theo `seq`; DTO trả vai trò `me|partner`.
- **Reaction**: realtime-only (`movie.reaction.sent`, không persist, không kèm userId),
  whitelist emoji `😂😍😱👏` + throttle.
- **Config**: `MOVIE_MATCH_ANON_VIDEO_URLS`, `MOVIE_MATCH_ANON_DURATION_SECONDS` (mặc định
  1080 = 18:00 đúng timer mockup), `MOVIE_MATCH_QUEUE_MAX_WAIT_SECONDS`,
  `MOVIE_MATCH_MESSAGE_MAX_LENGTH`.
