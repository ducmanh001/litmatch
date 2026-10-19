# Realtime qua Signaling Gateway — slice nền fanout (Giai đoạn 2) + cluster adapter (Giai đoạn 6)

> Phạm vi: nền realtime của `apps/signaling-gateway` (Socket.IO) + cách core-api publish +
> Redis cluster adapter cho horizontal scale (§ 6).
> **Ngoài phạm vi**: điều khiển LiveKit (mint token phòng, join/leave call, ACK media —
> thuộc mục SFU/Calling của roadmap).

## 1. Nguyên tắc phân vai (docs/03 § 3.3)

Gateway **không chứa business logic** và không query DB. Mọi quyết định authz/membership/
ẩn danh do **core-api quyết TẠI THỜI ĐIỂM PUBLISH**: event được publish vào channel theo
**người nhận** `realtime:user:{userId}`, payload đã tính sẵn per-recipient (vd `senderRole`
của chat ẩn danh là `me|partner`, không bao giờ chứa userId đối phương). Gateway chỉ làm 3
việc: (1) verify JWT lúc handshake, (2) join socket vào room `user:{userId}` lấy từ
`payload.sub` **đã verify** — không nhận room từ client, (3) relay envelope Redis → socket
nguyên văn. Nhờ vậy slice này **không cần internal API** giữa gateway và core-api.

## 2. Hợp đồng (1 định nghĩa duy nhất — `@litmatch/common-dtos`)

- `AccessTokenPayload` (`auth-token.ts`): core-api ký, core-api guard + gateway handshake
  cùng verify bằng CÙNG `JWT_SECRET`. Gateway không bao giờ ký token.
- `realtime-events.ts`: channel builder/parser, tên event, kiểu payload
  (`RealtimeEnvelope<T>`). Event hiện có: `soul.message`, `soul.matched`, `soul.ended`, `match.matched`,
  `match.confirmed`, `call.ended`, `friend.message`, `friend.streak.increased`,
  `friend.streak.at_risk`, `party.member.joined`, `party.member.left`, `party.role.changed`,
  `party.room.closed`, `party.host.disconnected`, `party.host.reconnected`, `gift.sent`,
  `movie.session.started`, `movie.state.changed`, `movie.session.ended`,
  `movie.reaction.sent`, `minigame.session.started`, `minigame.session.resolved`.
  `specs/realtime.asyncapi.yaml` is a transport-level companion, while this source type file
  remains the single definition of event names and payloads. Thêm event mới = thêm vào file này,
  2 app cùng thấy — lệch hợp đồng là lỗi compile.

## 3. Ngữ nghĩa best-effort (chủ đích, không phải thiếu sót)

Publish luôn chạy **SAU khi DB transaction commit**, bọc try/catch + log warn
(`common/realtime/publish-realtime.ts` phía core-api) — publish fail **không** phá nghiệp vụ
đã commit, và replay idempotency **không bắn lại** event. Client luôn còn REST polling làm
fallback (`GET /matching/tickets/:id`, `GET /soul-match/sessions/:id[/messages]`). Vì event
là ephemeral + có fallback nên **không dùng outbox** cho luồng này (outbox dành cho consumer
nghiệp vụ như Notification — docs/10 § Distributed).

Rollout và hết hạn lease đóng transport Engine.IO, để Socket.IO tự reconnect bằng backoff/jitter;
không gửi namespace DISCONNECT vốn làm client dừng tự nối lại. Browser retry lỗi admission tạm thời
`CONNECTION_QUOTA_UNAVAILABLE` tối đa 8 lần với equal jitter, trần 30 giây/lần; `UNAUTHORIZED`
chỉ thử refresh session một lần cho tới khi connect thành công. Hết lượt hoặc bị từ chối vĩnh viễn
thì REST polling tiếp tục làm fallback. Logout hủy timer và callback muộn của socket cũ không
được mở lại kết nối. Refetch phục hồi chạy sau sự kiện namespace `connect` (đã auth/join room),
kể cả khi kết nối lại qua retry admission, không chạy sớm ở sự kiện transport `reconnect`.

## 4. Producer hiện có (core-api)

| Nơi publish                                          | Event             | Người nhận                   |
| ---------------------------------------------------- | ----------------- | ---------------------------- |
| matcher-worker `confirmPair` thành công (sau commit) | `match.confirmed` | cả 2 user của cặp            |
| `confirmTicket` chốt session legacy (sau commit)     | `match.confirmed` | cả 2 user                    |
| `soul-match` gửi message MỚI (sau persist)           | `soul.message`    | cả 2 (payload per-recipient) |
| `soul-match` mutual like TẠO friendship (sau commit) | `soul.matched`    | cả 2                         |
| `soul-match` một bên rời phòng (sau commit)          | `soul.ended`      | cả 2                         |
| `calling` end call ở MỌI nhánh (sau commit)          | `call.ended`      | cả 2 user của call           |
| `friend` gửi message chat 1-1 (sau persist)          | `friend.message`  | cả 2 bạn                     |
| `party-room` join/leave/đổi role/đóng phòng          | `party.*`         | member active của phòng      |
| `gift` tặng quà thành công (SAU transaction tiền)    | `gift.sent`       | member active của phòng      |

Mỗi module publish bằng Redis client riêng của mình (docs/05 § 5.3) qua helper chung
`publishRealtimeEvent`.

## 5. Gateway (apps/signaling-gateway)

- Namespace `/signaling`; handshake `auth.token` = access token của core-api; fail →
  `connect_error: UNAUTHORIZED` (không thành connection — không tồn tại socket vô danh).
- Quota connection/user là lease trong Redis (`signaling:connection-quota:{userId}`), acquire
  atomic bằng Lua trên toàn cụm. `WS_MAX_CONNECTIONS_PER_USER` mặc định 3;
  `WS_CONNECTION_LEASE_MS` mặc định 90 giây. Pod chết thì lease tự hết hạn. Cùng lease đó cập nhật
  `realtime:presence:{userId}` để core-api đọc trạng thái online; presence cũng có member theo
  lease, TTL và bị dọn khi disconnect nên không có race xoá trạng thái khi user còn socket khác.
  Redis/quota lỗi thì **handshake mới** fail closed `CONNECTION_QUOTA_UNAVAILABLE`, không fallback
  về Map cục bộ.
- **Gia hạn lease gộp lô** (`lease-refresher.ts`): MỘT timer mỗi pod (tick 1 giây) gom các lease
  đến hạn thành pipeline `EVALSHA` theo shard, chu kỳ `WS_CONNECTION_LEASE_REFRESH_MS` (0 = lease/3),
  pha gia hạn được rải ngẫu nhiên (lần đầu trong [0,3; 1,0] chu kỳ, các lần sau ±10%) để không dồn
  thành đợt sau reconnect hàng loạt. Redis báo `lost` → thử **cấp lại** lease trước (script acquire
  idempotent theo leaseId và kiểm trần socket/user): Redis restart/failover mất dữ liệu làm MỌI lease
  biến mất cùng lúc, và ngắt hết socket lúc đó là biến sự cố Redis thành reconnect storm. Chỉ khi hết
  slot mới ngắt socket; lease của socket đã disconnect trong lúc chờ không được cấp lại (tránh lease
  ma). Cấp lại chạy theo NHIỀU lô pipeline (≤500 lease/lô mỗi shard) nên một socket có thể ngắt và release SAU khi danh sách
  cần cấp lại đã chốt nhưng TRƯỚC khi lô của nó chạy; lô đó vẫn cấp một lease không ai còn giữ — refresher nhả (`releaseMany`)
  mọi lease vừa được cấp lại mà entry đã bị gỡ, kể cả khi response là `error` vì Redis có thể đã ghi
  thành công trước khi timeout, thay vì để slot ma và presence online giả tới hết TTL.
  Redis lỗi/timeout (`error`) → **không ngắt ngay**: thử lại mỗi ≤5 giây, và socket bị ngắt khi
  lần gia hạn thành công cuối đã đủ `WS_CONNECTION_LEASE_MS` trừ biên an toàn (≥ 2 tick, ≤ 5 giây), tức
  trước khi Redis có thể cấp lại slot. Mốc này được quét ĐỘC LẬP với việc gia hạn (`sweepExpired` mỗi
  tick, kể cả khi tick gia hạn đang treo chờ Redis) nên Redis treo không kéo dài thời gian giữ socket
  quá hạn lease — trần socket/user chỉ có thể bị vượt trong khoảng độ trễ của event loop. Một lần
  Redis chớp vài giây không còn làm rớt cả đàn socket rồi dồn reconnect vào đúng Redis đang hồi phục
  (bản cũ ngắt mọi socket ngay khi connection quota đóng). Redis mất lâu hơn một lease thì socket rớt
  dần theo pha gia hạn của từng socket. Trần xử lý `maxBatch` = 5.000 lease/tick/pod (≈ 5.000 gia
  hạn/giây); gia hạn tới hạn nhiều hơn mức đó (sau outage dài) được dàn qua các tick kế tiếp.
- **Subscribe theo user** (`realtime-fanout.ts`, `WS_FANOUT_MODE=user`, mặc định): pod chỉ
  `SUBSCRIBE realtime:user:{userId}` cho user đang có socket TRÊN POD (đếm theo socket; socket cuối
  rời thì `UNSUBSCRIBE`). Handshake chỉ hoàn tất SAU khi `SUBSCRIBE` được Redis xác nhận, nên mọi
  event publish sau khi client thấy `connect` đều tới pod. Khi connection Redis nối lại, pod tự
  subscribe lại đúng tập user hiện có (`autoResubscribe` của ioredis tắt có chủ đích); socket thứ
  hai của cùng user đến lúc shard đang reconnect cũng gửi lại `SUBSCRIBE` (idempotent) và fail closed
  như socket đầu nếu Redis chưa nhận. Lần `SUBSCRIBE` đã bị từ chối/timeout được ghi là `failed` trên entry của user: promise đã
  reject không được dùng lại cho socket sau (Redis hồi phục rồi mà user còn socket cũ vẫn bị từ chối kết nối mới trên pod đó) —
  socket kế tiếp luôn gửi lại `SUBSCRIBE`. Shutdown: `beginClose` trước khi ngắt socket nên không có bão
  `UNSUBSCRIBE` từng user (QUIT đã bỏ mọi subscription). Chế độ
  `pattern` giữ cách cũ (`PSUBSCRIBE realtime:user:*`: mọi pod nhận MỌI event, tổng công việc
  tỉ lệ `event × pod`) làm đường lùi. 1 connection Redis riêng cho mỗi shard (ioredis subscriber
  mode không dùng chung với lệnh khác); channel lạ/payload rác → bỏ qua + log, không chết.
- **Readiness theo shard** (`/health/ready`): pod ready khi có ÍT NHẤT MỘT shard phục vụ được (lease đã
  kết nối VÀ subscription mong muốn đã có hiệu lực); body báo `checks.realtimeShards: "k/N"`. Một shard
  hỏng chỉ làm user của shard đó fail closed lúc handshake — rút pod khỏi load balancer vì một shard sẽ
  ngừng phục vụ cả user ở các shard còn lại (và pod mới cũng không khởi động nổi để gánh tải:
  `onModuleInit` chỉ đòi MỘT shard lên). Alert khi `signaling_redis_shards_ready < _total`. Socket.IO cluster
  adapter (Redis `REDIS_URL`) vẫn bắt buộc cho readiness như trước.
- `relay()` kiểm tra room cục bộ TRƯỚC khi parse JSON: event cho user không còn socket trên pod
  (đến muộn sau `UNSUBSCRIBE`, hoặc ở chế độ `pattern`) bị bỏ qua gần như miễn phí.
- Metric (OTLP): `signaling_connections_active`, `signaling_fanout_subscribed_users`,
  `signaling_tracked_leases`, `signaling_redis_shards_ready`/`_total`, `signaling_relay_events_total{result}`, `signaling_lease_refresh_total{result}`
  — nguồn cho autoscale theo số kết nối và alert (readiness `redisSubscription` down kéo dài).
- Socket chết được dọn bởi ping/pong mặc định của Socket.IO (`pingTimeout`) — chưa cần timer
  riêng vì gateway không giữ room state nghiệp vụ (docs/10 § Calling/Signaling).
- Config Joi: `JWT_SECRET` (bắt buộc, cùng core-api), `JWT_SECRET_PREVIOUS` (tuỳ chọn, chỉ trong cửa sổ
  xoay khoá — khoá phụ chỉ để verify khi chữ ký không khớp `JWT_SECRET`; quy trình 3 bước ở `k8s/README.md`), `REDIS_URL`,
  `REALTIME_REDIS_URLS` (§ 7), `WS_FANOUT_MODE`, `WS_CONNECTION_LEASE_MS`, `WS_CONNECTION_LEASE_REFRESH_MS`.

## 6. Cluster adapter cho Socket.IO (Giai đoạn 6 — horizontal scale)

`SignalingRedisAdapterService` (`apps/signaling-gateway/src/app/redis-adapter.service.ts`) mở
**2 kết nối Redis riêng** cho `@socket.io/redis-adapter` — KHÔNG dùng chung với connection
subscribe của `SignalingGateway` (giữ đúng nguyên tắc "1 connection riêng cho subscribe" ở § 5). Adapter được `connect()` xong TRƯỚC `app.listen()` và gắn vào `CorsIoAdapter`
(nay nhận thêm tham số `clusterAdapter`) — bắt buộc thứ tự này vì `afterInit()` của gateway (chạy
lúc `listen()`) cần Server đã có adapter.

Giá trị mang lại: gọi `server.to(room).emit()` ở 1 instance giờ tới được socket đang giữ ở
**instance khác** trong cụm — điều relay ở § 3-4 (mỗi instance tự nhận event của user có socket
trên nó qua Redis pub/sub rồi chỉ emit cho room cục bộ của mình) vốn KHÔNG cần tới cluster adapter
để hoạt động đúng, nhưng cluster adapter mở đường cho các tính năng Socket.IO xuyên instance sau này
(broadcast toàn cụm, `fetchSockets()`...) mà không phải thiết kế lại tầng transport.

**Hệ quả bắt buộc cho relay:** vì nhiều pod có thể cùng relay một event (mọi pod ở chế độ `pattern`,
hoặc user có socket ở nhiều pod), `relay()` phải emit qua
`server.local.to(room).emit()`. Một broadcast không-local còn được cluster adapter chuyển tiếp sang
các pod khác, nên socket sẽ nhận N bản (N = số pod). Guard: `signaling.relay-cluster.spec.ts` chạy
mã thật của `@socket.io/redis-adapter` trên bus pub/sub giả với 2 pod (không cần Redis) và
`signaling.horizontal-scale.integration.spec.ts` kiểm lại trên Redis thật. Tính năng xuyên instance
mới (không phải relay theo user) mới dùng broadcast toàn cụm, và phải tự bảo đảm không bị relay
nhân bản.

Đánh đổi đã chấp nhận: relay cục bộ nghĩa là mỗi pod chỉ giao event qua subscription của chính nó. Pod mất
subscription (readiness `redisSubscription: down`) thì socket đang nối vào pod đó không nhận event cho tới
khi subscription phục hồi hoặc client reconnect sang pod khác; trước đây pod khác vô tình bù được qua
adapter. Vì socket đang sống không còn bị ngắt khi Redis chớp (§ 5), client KHÔNG biết mình vừa lỡ event
trong cửa sổ đó — phù hợp với Redis Pub/Sub at-most-once nhưng nghĩa là REST polling fallback là bắt buộc
(mọi tính năng đã có) và nên có alert khi `redisSubscription` down kéo dài.

Verify: `signaling.horizontal-scale.integration.spec.ts` boot 2 Nest app instance thật (2 port
khác nhau, cùng Redis thật), 1 client chỉ connect vào instance A, gọi thẳng `server.to(room).emit()`
ở instance B — client vẫn nhận được event. Test cũng mở quota xuyên cả hai instance, từ chối socket
thứ tư và xác nhận disconnect rồi reconnect ở pod khác lấy lại slot. Readiness `/health/ready`
cộng thêm check `redisClusterAdapter`, Redis quota (song song `redisSubscription` sẵn có).

Lưu ý transport: cluster adapter không tự giải quyết sticky-session cho Socket.IO long-polling
qua nhiều instance — client hiện đã cố định `transports: ['websocket']` (xem test), nên không cần
sticky session ở tầng LB miễn còn giữ đúng cấu hình này.

## 7. Chia shard Redis theo userId (mặt phẳng realtime)

Một Redis đơn lẻ có trần CPU cứng cho hai việc: gia hạn lease/presence của mọi socket và giao event
pub/sub. `loadtest/realtime-plane-bench.mjs` đo trên Redis 7 (Docker, máy dev — đọc TỈ LỆ, không đọc
số tuyệt đối): gia hạn lease tốn ≈29 µs CPU Redis/lệnh với `EVAL` từng socket và ≈16 µs với `EVALSHA`
gộp pipeline; một event tốn ≈3 / 13 / 57 µs với `PSUBSCRIBE` khi có 1 / 10 / 40 pod (tăng theo số pod)
so với ≈3 / 4 / 7 µs với `SUBSCRIBE` theo user. Gộp lô và subscribe theo user (§ 5) đẩy trần lên, nhưng
cả hai vẫn là CPU của MỘT Redis; chia shard theo userId là cách duy nhất để tăng trần tuyến tính.

- `REALTIME_REDIS_URLS=redis://a:6379,redis://b:6379,...` (tối đa 64, mỗi URL một shard). Rỗng = một
  shard là `REDIS_URL` (hành vi cũ). Shard của user = `realtimeShardIndex(userId, số shard)` trong
  `@litmatch/common-dtos` — core-api (publish, đọc presence) và signaling-gateway (lease, presence,
  subscribe) dùng CHUNG hàm này; test known-vector khoá hàm để không ai đổi nó mà không có kế hoạch.
- Mọi thao tác của một user (publish, subscribe, lease, presence) nằm trên MỘT shard — không có lệnh
  nào đi xuyên shard, nên script Lua hai key vẫn atomic và thêm shard là tăng trần tuyến tính.
- `REDIS_URL` vẫn dùng cho Socket.IO cluster adapter, throttler, hàng đợi matching... — chỉ pub/sub
  `realtime:user:*` và presence/quota socket đi theo shard.
- **Danh sách PHẢI giống nhau (cùng URL, cùng thứ tự) ở core-api và signaling-gateway.** Lệch thì event
  được publish vào shard không pod nào subscribe và presence đọc nhầm shard: best-effort nên không mất dữ
  liệu bền, nhưng realtime "câm" — xem test `signaling.sharded.integration.spec.ts` (cần hai Redis thật,
  `INTEGRATION_REDIS_SHARD_URLS`) để kiểm chứng routing sau khi đổi cấu hình.
- Đổi số shard = đổi chỗ của user. State ở đây ephemeral (không có dữ liệu bền) nên chỉ cần rolling
  restart cả hai app với danh sách mới, ưu tiên giờ thấp tải. Trong cửa sổ hai app còn lệch nhau,
  event của user bị đổi shard có thể mất (REST polling bù) và presence nhấp nháy offline tới lần gia hạn
  lease kế tiếp (≤ `WS_CONNECTION_LEASE_REFRESH_MS`).
- Sizing: `shard ≥ ⌈(socket ÷ chu kỳ gia hạn × µs/lệnh + event/giây × µs/event) ÷ (mục tiêu sử dụng
× 10⁶)⌉` — dùng `pnpm capacity:model` để thay số thật; chạy lại benchmark trên chính Redis production
  trước khi tin các hằng số µs.
