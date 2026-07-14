[← 06 · Domain Rules](./06-domain-rules.md) · **07 · Roadmap** · [08 · Working with Agents →](./08-working-with-agents.md)

# 7. Checklist triển khai theo giai đoạn

> **Ghi chú thuật ngữ**: trong toàn bộ file này, tên gọi "... Service" nghĩa là **module NestJS
> bên trong `apps/core-api`**, không phải service deploy riêng. Baseline có đúng ba backend
> deployable; tách module ở Giai đoạn 7 chỉ hợp lệ sau số liệu + ADR cập nhật toàn bộ invariant
> và guard theo [03 § 3.4](./03-architecture.md).
>
> **Trạng thái hiện tại của dự án**: xem đầu file này hoặc hỏi lại nếu không rõ đang ở giai đoạn nào — file này không tự động cập nhật trạng thái, người dùng/agent cần tick `[x]` thủ công khi hoàn thành và commit lại.

## Giai đoạn 0 — Nền móng

- [x] Setup monorepo (**Nx + pnpm + Node 22 LTS — đã chốt ở [04-tech-stack.md](./04-tech-stack.md)**) gồm 3 app theo đúng § 3.2 (`core-api`, `signaling-gateway`, `media-server`) + các thư viện dùng chung — không tạo thêm app NestJS riêng cho từng domain (Auth/User/Matching...), các domain này là module trong `core-api`
- [x] `docker-compose` local: Postgres, Redis, **Kafka** (đã chốt ở [04-tech-stack.md](./04-tech-stack.md))
- [x] Auth module: phone OTP + social login (Google/Apple — Facebook dùng access token không phải OIDC, bổ sung khi cần) + **guest account** giới hạn tính năng (xem [06-domain-rules.md](./06-domain-rules.md)), JWT + refresh token rotation có phát hiện reuse
- [x] User module (CRUD profile cơ bản + avatar mặc định + enforce tuổi tối thiểu ở server)
- [x] CI pipeline: lint, test, build, docker image (`.github/workflows/ci.yml` — registry push cấu hình ở Giai đoạn 6)
- [x] Shared libs: `common-exceptions`, `common-dtos`, `logger`, `config-validator`

## Giai đoạn 1 — Economy trước (vì mọi feature khác phụ thuộc vào nó)

> Vì mục tiêu là quy mô Litmatch thật (không phải MVP), xây **double-entry ledger đầy đủ ngay từ Giai đoạn 1** theo đúng [03-architecture.md § 3.8.C](./03-architecture.md) — không làm bản đơn giản (1 cột `balance`) rồi tính chuyển đổi sau, vì đổi mô hình dữ liệu tiền bạc giữa chừng khi đã có giao dịch thật là việc rất tốn kém và rủi ro.

- [x] Economy module: `LedgerEntry` (double-entry, append-only — có DB trigger chặn UPDATE/DELETE) làm nguồn sự thật; idempotency key unique trên `Transaction`; `Wallet` chỉ là snapshot dẫn xuất, cập nhật cùng DB transaction — đúng [02-domain-model.md](./02-domain-model.md) + [services/economy-service.md](./services/economy-service.md)
- [x] Tích hợp Apple IAP + Google Play Billing: `StoreIapVerifier` (Apple verifyReceipt + Google Play Developer API) đã viết, **chưa chạy sandbox thật vì chưa có credential store** — dev dùng `DevIapVerifier` (chặn cứng ở production); job đối soát chạy định kỳ từ ngày đầu (bất biến Nợ=Có, receipt↔transaction, wallet↔ledger)
- [x] VIP membership: mua bằng diamond, gia hạn cộng dồn, hết hạn tự downgrade (derive khi đọc, không phụ thuộc cron)
- [x] Refund/chargeback IAP ([services/economy-service.md § 5](./services/economy-service.md)): webhook Apple App Store Server Notifications V2 + Google RTDN (verify chữ ký/OIDC, `@Public()`), job quét backstop (Apple Get Refund History + Google Voided Purchases), bút toán đảo cho phép balance âm (nợ diamond) thay vì clamp về 0 — **chưa chạy thật với webhook/credential sandbox** vì chưa có tài khoản Apple/Google Developer thật, đã verify bằng integration test trên Postgres thật (refund-sau-tiêu, idempotent replay, property test double-entry 60 bước ngẫu nhiên)

## Giai đoạn 2 — Matching lõi (Soul Match + Voice Match)

> Xây Matching module theo đúng hình dạng full-scale ở [03-architecture.md § 3.8.B](./03-architecture.md) ngay từ đầu (ticket state machine + shard theo tiêu chí), thay vì làm 1 queue Redis đơn giản rồi tái cấu trúc sau.

- [x] Matching module (slice M1 — ticket/queue engine): `MatchTicket` với state machine `queued → matched → confirmed → expired/cancelled`, queue **shard theo (loại match × region × dải tuổi)** — [services/matching-service.md](./services/matching-service.md). Giới tính KHÔNG phải tiêu chí shard (nhóm cùng giới lại không đúng kỹ thuật) — chuyển thành **filter lúc ghép cặp**, xem mục ngay dưới. Priority speed-up trừ diamond qua Economy module qua DI (không qua network) — đã có.
- [x] Matching: bộ lọc giới tính khi ghép cặp (docs/01 #13) — check 2 chiều tại `tryPair` trong transaction verify (cùng chỗ block/report, `docs/10 § 10.0.C`), snapshot preference lên ticket, KHÔNG shard theo gender — [services/matching-service.md § 2.1](./services/matching-service.md)
- [x] Soul Match: chat room ẩn danh tạm thời gắn `MatchSession` (phase derive từ giờ server, không cron), rating 2 chiều immutable `rude|boring|like`, cả 2 like → `Friendship` (module `friend` tối thiểu) trong cùng transaction + unlock profile — [services/soul-match-service.md](./services/soul-match-service.md). Realtime push chưa có (polling REST) — gộp vào mục Signaling Gateway ngay dưới, message store thiết kế sẵn để gateway fanout qua Redis pub/sub
- [x] Signaling Gateway (Socket.IO) — nền realtime fanout: JWT handshake, room theo user, relay Redis pub/sub `realtime:user:{userId}` (match.matched/confirmed cho Voice/Soul Match, soul.message/matched) — [services/realtime-gateway.md](./services/realtime-gateway.md). Điều khiển LiveKit (mint token, join call, ACK media) thuộc 2 mục dưới
- [x] Tích hợp SFU (**LiveKit self-host — ADR 0001**) cho phòng 2 người: port `LivekitRoomPort` (mint token server-side, deleteRoom, verify webhook), client nối thẳng LiveKit bằng token TTL ngắn — [services/calling-service.md](./services/calling-service.md)
- [x] Calling module: `CallSession` (pending→active→ended terminal, webhook idempotent), thời lượng theo giờ server, free-call ~7 phút tự end, billing theo phút (default TẮT — `CALLING_PRICE_PER_MINUTE_DIAMOND=0`) trừ cả 2 bên idempotent theo (call, user, phút), realtime `call.ended` — [services/calling-service.md](./services/calling-service.md)
- [x] Friend + Chat 1-1: `Conversation`/`Message` chat lâu dài giữa 2 user đã là bạn, `Conversation` tạo ATOMICALLY cùng `Friendship` (bất biến 1:1, không lazy-create), không ẩn danh (khác Soul Match), realtime `friend.message` tái dùng hạ tầng Signaling Gateway — [services/friend-service.md](./services/friend-service.md). **Giai đoạn 2 hoàn tất.**
- [x] **Discovery — browse theo tiêu chí (W1, plan tại [docs/plans/2026-07-14-plan-6-tinh-nang-social-discovery.md](./plans/2026-07-14-plan-6-tinh-nang-social-discovery.md)):** module mới `discovery` — filter gender/tuổi/khu vực kiểu dating app (khác bộ lọc giới tính lúc ghép cặp ở mục ngay trên — mục đó áp cho hàng đợi matching, mục này là màn duyệt/tìm chủ động), loại trừ block+report 2 chiều qua `SafetyService.getHiddenUserIds` (report ẩn **vĩnh viễn**, không cooldown như matching), card trả `ageBucket` (composition riêng, KHÔNG sửa `PublicProfileDto` dùng chung ở Soul Match/Friend) — [services/discovery-service.md](./services/discovery-service.md). CTA sau khi thấy user ở bản này: **chỉ xem profile**; re-chốt 2026-07-14 (lăng kính dating-first): sẽ bổ sung CTA **"mời Voice/Soul Match"** tái dùng matching engine — hạng mục W4 cùng đợt nearby (mục backlog dưới), không sửa lại bản đã code. Đã code + integration test Postgres thật PASS, **chờ `review-module verify` + commit**.
- [ ] **Backlog (ghi nhận 2026-07-14, chưa code, W4 — đôn lên từ W5 theo lăng kính dating-first):** discovery "tìm quanh đây" — duyệt danh sách user theo khoảng cách địa lý, khác cơ chế hàng đợi ghép cặp 1-1 hiện có của Soul/Voice Match nên cần thiết kế riêng (lưu toạ độ đã quantize, jitter chống trilateration, ghost mode **hoãn lại**). Cùng đợt: **CTA "mời Voice/Soul Match"** trên profile browse/nearby — directed invite tái dùng pipeline matching sẵn có (KHÔNG friend-request flow mới), rate limit chống spam mời; đây là mitigation chính cho rủi ro graph bạn bè sparse. Chi tiết đầy đủ tại [docs/plans/2026-07-14-plan-6-tinh-nang-social-discovery.md § 3.1](./plans/2026-07-14-plan-6-tinh-nang-social-discovery.md).
- [ ] **Backlog (ghi nhận 2026-07-14, chưa code, W2):** streak trò chuyện kiểu Snapchat — mở rộng module `friend` (entity `conversation_streaks` 1:1 conversation), tính **on-write** trong transaction `sendMessage` (không phải cron), mốc ngày UTC theo giờ server (không timezone local — chống spoof + tránh mơ hồ giữa 2 user khác múi giờ), streak chỉ tăng khi **cả 2 chiều** nhắn trong cùng ngày. Milestone chỉ là hook realtime/notification — thưởng diamond (nếu làm sau) bắt buộc qua `LedgerEntry`. Chi tiết tại [docs/plans/2026-07-14-plan-6-tinh-nang-social-discovery.md § 3.4](./plans/2026-07-14-plan-6-tinh-nang-social-discovery.md).
- [ ] **Backlog (ghi nhận 2026-07-14, chưa code, W1 phần preset):** mood status — module mới `mood`, preset catalog (auto-approve) trước, free-text hoãn tới khi có `ModerationPort` thật (repo hiện **chưa có** hệ moderation text nào — gap đã xác nhận). Hiển thị bằng composition (`MoodService.getPublicMood`), **không sửa `PublicProfileDto`**, không đưa mood lên card ẩn danh trước-match Soul Match. Chi tiết tại [docs/plans/2026-07-14-plan-6-tinh-nang-social-discovery.md § 3.5](./plans/2026-07-14-plan-6-tinh-nang-social-discovery.md).

## Giai đoạn 3 — Party Room + Gift

- [x] Party Room module: tạo phòng, quản lý role host/speaker/audience, **giới hạn cứng số speaker/phòng theo config** (`PARTY_MAX_SPEAKERS`, snapshot lên phòng lúc tạo; cap check DƯỚI lock FOR UPDATE row phòng — chặn race 2 request promote đồng thời, § 3.8.A) — [services/party-room-service.md](./services/party-room-service.md). Host rời → **đóng phòng** (không transfer host ở GĐ3); membership enforce ở DB bằng partial unique (1 user 1 phòng active); sweeper đối chiếu DB↔SFU làm backstop khi webhook rớt
- [x] Mở rộng SFU cho multi-party: port riêng grant theo role (audience `canPublish=false` NGAY TỪ TOKEN), đổi grant runtime qua `updateParticipant` đợi ACK trong transaction, tạo room tường minh với `maxParticipants`/`emptyTimeout`, webhook URL thứ 2 `party/webhooks/livekit` (livekit.yaml); env LiveKit đổi thành `LIVEKIT_*` dùng chung calling + party
- [x] Gift module: catalog quà (giá là data DB, server re-check tại thời điểm tặng), tặng quà realtime (`gift.sent` publish SAU commit), trừ diamond + cộng **điểm quy đổi** (`GIFT_POINTS_RATE_PERCENT`, guest nhận 0 điểm — docs/06) trong **cùng 1 DB transaction** qua `EconomyService.sendGift` (2 chân độc lập tự cân theo currency, GiftEvent ghi qua withinTransaction) — [services/gift-service.md](./services/gift-service.md). Hoàn tiền gift CHƯA làm (quyết định mở ở [services/economy-service.md § 6](./services/economy-service.md)). **Giai đoạn 3 hoàn tất.**

## Giai đoạn 4 — Social layer

- [x] Feed module: post, like, comment — [services/feed-service.md](./services/feed-service.md); feed công khai toàn cục (không Follow/fanout), block cắt điểm chạm, counter atomic
- [x] Avatar module: catalog item, ghép avatar — [services/avatar-service.md](./services/avatar-service.md); multi-layer thật (base/tóc/mặt/trang phục/phụ kiện), mua qua `spendDiamond` generic, chống IDOR lúc trang bị
- [x] Report/Block, trust score ảnh hưởng matching — [services/safety-service.md](./services/safety-service.md); wire `MATCH_INTERACTION_POLICY` thật (Matching) + guard block 2 chiều (Friend Chat 1-1)
- [x] Notification module: in-app cho match thành công (ẩn danh — không lộ partnerId), tin nhắn mới, nhận gift, like/comment — [services/notification-service.md](./services/notification-service.md); gọi trực tiếp qua DI cùng transaction hành động gốc (không Outbox/Kafka — quyết định GĐ4, chỉ 1 consumer); push `DevPushProvider` no-op, **chưa có FCM/APNs thật** (nợ kỹ thuật ghi rõ, cần credential)
- [ ] **Backlog (ghi nhận 2026-07-14, chưa code, W3 — scope đã cắt theo lăng kính dating-first):** Stories + Feed audience — mở rộng module `feed` hiện có, **chỉ làm P1 + P4**: P1 audience per-post `public|friends|only_me` + profile timeline + idempotency createPost; P4 **Stories** entity riêng (hết hạn = filter lúc đọc là nguồn sự thật, sweeper chỉ dọn rác; reply story → DM qua `FriendService.sendMessage` — story là opener phục vụ vòng match). Quyết định đã chốt: ring stories chỉ bạn bè + mình. **P2 (reactions đa loại + comment threading), P3 (share/edit history/pin), P5 (ranking EdgeRank) chuyển backlog vô thời hạn** — cơ chế mạng-xã-hội-gắn-bó kiểu FB không phục vụ mục đích dating, chỉ mở lại khi số liệu user đòi (thiết kế đã nghiên cứu giữ trong plan). Chi tiết tại [docs/plans/2026-07-14-plan-6-tinh-nang-social-discovery.md § 3.3](./plans/2026-07-14-plan-6-tinh-nang-social-discovery.md).

## Giai đoạn 5 — Content phụ trợ

- [x] Movie Match: đồng bộ playback qua WebSocket — [services/movie-match-service.md](./services/movie-match-service.md); chỉ giữa 2 bạn (tái dùng `Friendship`/`Conversation`, không chat riêng), playback state last-write-wins (UX ephemeral, không lock kiểu ledger), 1 session active/user qua bảng phụ trợ `movie_session_active_participants`
- [x] Palm Match: template content, random theo input — [services/palm-match-service.md](./services/palm-match-service.md); random deterministic theo `(userId, category, ngày server UTC)` qua FNV-1a hash, seed tính hoàn toàn ở server
- [x] Mini game: oẳn tù tì 2 người — [services/mini-game-service.md](./services/mini-game-service.md); 1 game đại diện (rock-paper-scissors) theo đúng tinh thần ưu tiên thấp nhất, nộp move qua UPDATE có điều kiện chống lộ/double-submit, mở rộng thêm game khác dùng lại khung `MiniGameSession`. **Giai đoạn 5 hoàn tất.**
- [ ] **Backlog (ghi nhận 2026-07-14, chưa code, W5, ship SAU CÙNG):** Video ngắn — module mới `short-video`, KHÔNG đụng `media-server` (LiveKit là SFU realtime, transcode VOD khác hẳn — cần ADR nếu ai muốn dùng chung); hạ tầng media chỉ là 2 port (`VideoStoragePort`/`VideoTranscodePort`) + Dev impl chặn cứng production, vendor storage/transcode và vendor moderation UGC **chưa chốt** (cam kết chi phí bên thứ 3 — hỏi lại đúng lúc). Hướng sản phẩm đã chốt: đi theo Momo (video gắn gift economy, highlight profile/party-room) — **KHÔNG** clone TikTok feed toàn cục (tiền lệ ngành: Snack/Lolly/Tinder Loops/Feed đều thất bại). `VIDEO_MODERATION_MODE` mặc định `pre`. Chi tiết tại [docs/plans/2026-07-14-plan-6-tinh-nang-social-discovery.md § 3.2](./plans/2026-07-14-plan-6-tinh-nang-social-discovery.md).

## Giai đoạn 6 — Scale & Observability

- [x] Horizontal scale Signaling Gateway (Redis adapter cho Socket.IO): `@socket.io/redis-adapter`
      qua `SignalingRedisAdapterService` (2 kết nối Redis riêng — KHÔNG dùng chung với connection
      PSUBSCRIBE `realtime:user:*` sẵn có), gắn vào `CorsIoAdapter` trước `app.listen()` —
      [services/realtime-gateway.md § 6](./services/realtime-gateway.md). Verify bằng integration
      test 2 instance gateway độc lập thật (`signaling.horizontal-scale.integration.spec.ts`):
      `server.to(room).emit()` gọi ở instance B tới được socket chỉ connect ở instance A. Readiness
      `/health/ready` cộng thêm check `redisClusterAdapter`.
- [x] Kubernetes deployment + autoscale: `k8s/` (kustomize base + overlay `staging`/`production`)
      cho đúng 3 backend deployable — Deployment/Service/ConfigMap/Secret-placeholder/HPA/PDB cho
      `core-api` + `signaling-gateway`, Deployment/Service/ConfigMap riêng cho `media-server`
      (KHÔNG HPA — một room vẫn phải vừa một node theo docs/03 § 3.5, networking RTC multi-node
      thật cần ADR riêng, chưa quyết ở đây). Xem giả định/điểm mở trong `k8s/README.md`.
- [x] Monitoring: Prometheus metrics (matching latency, call drop rate, transaction failure rate):
      `libs/observability` (`prom-client`, registry riêng mỗi process + `http_request_duration_seconds`
      dùng chung) + `/metrics` (không JWT, không throttle) trên `core-api`/`signaling-gateway`;
      LiveKit tự phơi `prometheus_port` riêng (`media-server-config`). 3 metric domain theo đúng
      yêu cầu: `matching_ticket_wait_seconds` (`MatchingMetrics`, ghi trong `MatcherWorkerService.tryPair`
      lúc match), `call_ended_total{reason}` (`CallingMetrics`, ghi trong `CallingService.endById`
      — drop rate = tỉ lệ `reason!="completed"` tính ở PromQL), `economy_transaction_total{type,result}`
      (`EconomyMetrics`, ghi tại ĐIỂM DUY NHẤT `LedgerService.record()` — bao trùm mọi giao dịch
      Economy vì đây là writer duy nhất của ledger). Verify bằng unit test cho từng metric + 5 suite
      integration Economy/Matching/Calling/Gift/Avatar chạy thật trên Postgres+Redis.
- [x] Distributed tracing xuyên suốt Matching → Calling → Economy: `@opentelemetry/sdk-node` +
      `auto-instrumentations-node` (http/express/pg/ioredis/pino...) bootstrap ở `apps/*/src/tracing.ts`
      (import ĐẦU TIÊN trong `main.ts` — ràng buộc kỹ thuật thật của OTel JS, đã verify bằng script
      tay + app build thật). Opt-in qua env chuẩn OTel `OTEL_EXPORTER_OTLP_ENDPOINT` — KHÔNG khởi
      động SDK nếu thiếu (tránh export lỗi âm thầm ở dev/test/CI chưa có collector); metrics/logs
      của chính OTel SDK bị tắt hẳn để không chồng lấn Prometheus/pino đã chọn. HTTP request tự
      thành root span (nối Matching/Calling/Economy khi cùng 1 request chạm cả 3, vd `CallingService.joinCall`
      đọc `MatchingService`); 2 background job không có parent span tự nhiên (`MatcherWorkerService`,
      `CallTickerService` — nơi Calling thật sự chạm Economy qua `spendDiamond` mỗi phút billing)
      được bọc thủ công bằng `withSpan()` (`libs/observability/src/lib/traced.ts`). Bonus phát hiện
      khi verify: `@opentelemetry/instrumentation-pino` tự gắn `trace_id`/`span_id` vào mọi log —
      nối log ↔ trace không cần thêm code (docs/05 § 5.5).
- [x] Load test (k6/Artillery): `loadtest/` — `matching-queue.js`, `calling-flow.js` (k6, join
      queue → matched → confirm → join call), `signaling-ws.js` (k6, framing Socket.IO tự viết tay
      vì k6 không có client Socket.IO gốc — CHƯA verify được trên server thật, có
      `signaling-ws.artillery.yml` dùng `artillery-engine-socketio-v3` làm phương án thay thế đã
      kiểm chứng tốt hơn). Threshold trong script là điểm khởi đầu, cần chỉnh theo SLO thật khi có
      traffic production — xem `loadtest/README.md`.

**Giai đoạn 6 hoàn tất** — điểm mở cần quyết định trước khi vận hành thật ở quy mô lớn (không
chặn merge, ghi nhận để làm tiếp ở Giai đoạn 7 hoặc khi có nhu cầu): networking RTC multi-node cho
LiveKit trong K8s (hostNetwork vs NodePort per-pod — cần ADR riêng), chọn công cụ quản lý Secret
(sealed-secrets/Vault — hiện chỉ khai tên key, không tạo giá trị thật trong git), xác nhận framing
Socket.IO tay trong `signaling-ws.js` trên server thật trước khi tin số liệu của nó, và scale HPA
theo custom metric Prometheus (vd độ sâu matching queue) cần thêm `prometheus-adapter` — chưa làm.

## Giai đoạn 7 — Vận hành ở quy mô thật (Litmatch-scale, không còn là MVP)

> Vì ledger double-entry (Giai đoạn 1) và ticket/shard cho Matching (Giai đoạn 2) đã được **thiết kế đúng ngay từ đầu**, Giai đoạn 7 không phải là sửa lại thiết kế — mà là **vận hành/mở rộng thực sự** những gì đã thiết kế sẵn, khi số liệu traffic thật xác nhận cần (đúng tinh thần MonolithFirst ở § 3.1: quyết định _thiết kế_ chọn sớm, quyết định _khi nào bung ra hạ tầng thật_ thì chờ số liệu).

- [x] Benchmark LiveKit bằng profile Party Room production, đặt SLO/headroom và cảnh báo theo node:
      `loadtest/party-room-livekit.sh` dùng `lk load-test` (k6 không mở được kết nối WebRTC thật) với
      profile suy ra từ cấu hình Party Room thật (`PARTY_MAX_MEMBERS=100`, `PARTY_MAX_SPEAKERS=8`,
      audio-only) → 9 publisher/91 subscriber; mục tiêu SLO/headroom ở `loadtest/party-room-slo.yaml`;
      rule cảnh báo Prometheus theo node ở `k8s/base/media-server/prometheus-alerts.yaml`. **CHƯA
      chạy với LiveKit cluster production thật** — số liệu (đặc biệt trần "rooms per node") là placeholder
      chưa đo; xem `loadtest/README.md` mục 4 trước khi tin số liệu. Quyết định ADR (vertical scale,
      giới hạn sản phẩm hay đổi topology/provider khi một room chạm trần một node — § 3.8.A) vẫn chờ
      lần chạy thật đầu tiên, chưa có gì để quyết ở đây.
- [ ] Bung thêm shard/matcher worker instance cho Matching Queue theo region mới hoặc tiêu chí mới khi traffic khu vực đó đủ lớn — xem § 3.8.B
- [x] Mở rộng job đối soát (reconciliation) ledger chạy tần suất cao hơn + cảnh báo tự động khi phát hiện lệch Nợ/Có — xem § 3.8.C.
      Tách 2 tier độc lập lịch: fast (bất biến Nợ=Có + orphan receipt, 1 aggregate query, mặc định 60s
      qua `ECONOMY_RECONCILIATION_FAST_INTERVAL_MS`) và deep (sample ví, giữ cadence cũ 300s). Lệch/run
      lỗi export qua Prometheus (`economy_reconciliation_mismatch_total`, `economy_reconciliation_last_run_status`,
      `economy_reconciliation_run_duration_seconds`) để alert rule fire tự động — job vẫn read-only
      tuyệt đối. Verify: `pnpm agent:verify economy` PASS, integration test thật trên Postgres (39 suite/368
      test PASS, gồm property test double-entry + trigger append-only), unit test lịch 2 tier + DB-down.
- [ ] Khi module đạt tiêu chí § 3.4, lập ADR + số liệu + migration/rollback plan; chỉ sau khi ADR
      cập nhật invariant/guard mới tách khỏi `core-api` thành deployable riêng
- [ ] Multi-region deployment cho Signaling Gateway + Media Server, routing user tới region gần nhất (giảm latency thoại).
      **Nền tảng đã chốt + xong** (theo quyết định của user): [ADR 0004](./adr/0004-api-gateway-nginx-ingress.md)
      (API gateway = nginx-ingress) + [ADR 0005](./adr/0005-livekit-hostnetwork-rtc.md) (LiveKit RTC =
      `hostNetwork: true`, mở khoá chạy >1 node LiveKit — không tự đổi trần 1 room/1 node, việc đó
      vẫn chờ số liệu benchmark thật của mục 1). Cơ chế chọn LiveKit URL theo region đã chạy thật
      end-to-end: `LIVEKIT_REGION_URLS` (map region→URL, mặc định rỗng = hành vi y hệt hôm nay),
      Party Room snapshot URL theo region host lúc tạo phòng (migration `party-room-livekit-url`,
      cột `livekit_url` NULL cho phòng cũ), Calling dùng region `userA` + fallback an toàn khi 2 bên
      lệch region (`common/livekit/livekit-url.ts`). Ingress (nginx, sticky cookie cho Socket.IO)
      cho core-api/signaling-gateway đã thêm. Quyết định DNS/routing cuối cùng cũng đã chốt:
      [ADR 0006](./adr/0006-cloudflare-global-routing.md) — **Cloudflare Load Balancing
      (geo-steering)**, kèm scaffold hoàn chỉnh để kích hoạt: overlay region thứ hai
      `k8s/overlays/production-region-b/` (region code `REGION_B` là **placeholder** — chưa chốt
      market thứ hai nào về business, đổi code + URL khi chốt), ConfigMap real-IP cho
      ingress-nginx sau proxy Cloudflare, runbook ở `k8s/README.md` mục "Multi-region — vận hành
      khi có ngân sách". **CHƯA phải deployment thật** (cùng tình trạng với benchmark LiveKit ở
      mục 1): chưa tồn tại cluster region thứ hai, chưa có domain nào trên Cloudflare, chưa
      provision LB nào — toàn bộ là cấu hình sẵn-để-bật khi có ngân sách hạ tầng, không có gì
      đang route giữa các region hôm nay. Việc còn lại khi có tiền: mua/dựng cluster thứ hai,
      delegate DNS, điền region code + hostname thật theo runbook.
- [ ] CQRS/read-replica cho Feed khi lượng đọc vượt xa lượng ghi (fanout-on-write hoặc fanout-on-read tuỳ tỉ lệ follower trung bình)
- [x] Chaos testing cho luồng tiền (kill Economy giữa transaction, kill matcher giữa lúc ghép cặp) để xác nhận idempotency/outbox hoạt động đúng dưới lỗi thật, không chỉ đúng trên giấy.
      3 kịch bản lỗi inject thật trên Postgres/Redis thật (không mock): (1) crash giữa transaction
      Economy qua hook `withinTransaction` của `LedgerService.record()` — rollback đủ (0 transaction/
      entry/outbox mồ côi, ví không đổi), idempotency key KHÔNG bị tiêu bởi lần fail, retry cùng key
      thành công đúng 1 lần; (2) 2 instance `OutboxRelayService` chạy `flushOnce()` song song trên
      cùng batch — `FOR UPDATE SKIP LOCKED` chia batch đúng, không publish trùng; Kafka chết lúc
      publish — event ở lại outbox (không mất), tick sau publish lại đúng 1 lần; (3) matcher chết
      giữa `ZPOPMIN` và transaction `tryPair` — không session dở dang, ticket mồ côi được sweeper dọn,
      sweep lại idempotent; matcher chết giữa commit và publish realtime — client vẫn khám phá match
      qua poll fallback thật (`GET /matching/tickets/:id`); sweeper chết giữa commit requeue và Redis
      zadd — không tạo ticket đôi, `requeueIdempotencyKey` được unique constraint DB chặn thật (không
      chỉ là quy ước đặt tên). Không phát hiện bug production — cơ chế hiện hữu đứng vững dưới lỗi
      thật. Verify: `pnpm agent:verify economy` + `matching` PASS, integration test thật 39 suite/374
      test PASS.

**Giai đoạn 7 (đợt này) hoàn tất 3/7 mục** — 4 mục còn lại chưa làm vì đều bị chặn bởi thứ chỉ số
liệu/quyết định thật mới mở khoá được, không phải do thiếu công sức: bung shard/worker theo region
(mục 2) và tách service theo § 3.4 (mục 4) cần **số liệu traffic production thật** — repo hiện không
có traffic thật để đo, tự chọn ngưỡng sẽ vi phạm chính nguyên tắc "không hardcode threshold theo
đoán" của repo này. Multi-region deployment (mục 5): cả ba quyết định kiến trúc đã được user chốt
(ADR 0004 nginx-ingress + ADR 0005 hostNetwork + ADR 0006 Cloudflare LB, 2026-07-13), cơ chế chọn
URL theo region đã code xong và scaffold kích hoạt (overlay region thứ hai + runbook) đã có đủ —
mục này vẫn để mở vì phần "deployment" theo đúng nghĩa đen chưa xảy ra: chưa có ngân sách/cluster
cho region thứ hai nên chưa provision gì thật, chỉ còn việc hạ tầng + điền placeholder khi có
tiền. CQRS Feed (mục 6) cần số liệu tỉ lệ đọc/ghi thật, chưa động tới
trong đợt này — cùng lý do "không thiết kế cho nhu cầu giả định" (docs/11).

## Frontend track (song song, không thuộc số Giai đoạn backend)

> `apps/admin` và `apps/web` là client, không phải domain service ([12-frontend-architecture.md](./12-frontend-architecture.md)) — track này chạy **song song** với các Giai đoạn backend ở trên, không chiếm số Giai đoạn riêng (giữ đúng quy ước "không đánh lại số cũ"). Mỗi mục phụ thuộc backend nào được ghi rõ; mục không ghi phụ thuộc là làm được ngay.

- [x] Hợp đồng REST: `openapi:sync` + `libs/api-client` (ApiError, refresh rotation, token store) — xong 2026-07-13
- [x] Scaffold core/base `apps/admin` (Vite+React) + `apps/web` (Next.js): env, providers, auth OTP, layout shell, realtime/media wiring; DoD máy qua `pnpm agent:verify frontend` — xong 2026-07-13
- [x] **Task 0 backend** (chặn mọi feature UI thật của admin): role enum + `RolesGuard` + admin endpoints + CORS — [12 § 12.7](./12-frontend-architecture.md) — xong 2026-07-13
- [x] Admin: users, moderation queue, economy ops, gift catalog (phụ thuộc Task 0 backend ở trên) — xong 2026-07-13
- [x] Web: matching, chat 1-1, party room UI (phụ thuộc Giai đoạn 2/3 backend — đã xong, làm được độc lập với Task 0 admin) — xong 2026-07-13
- [x] CI gate chống lệch cả OpenAPI spec + generated client (`openapi:sync` + git status) — xong 2026-07-13, [12 § 12.3](./12-frontend-architecture.md)
- [x] Coverage ratchet riêng cho `admin`/`web`/`api-client` khi feature thật đầu tiên vào (cùng cơ chế chỉ-nâng-không-hạ như core-api) — xong 2026-07-13
- [x] **Security gate trước public launch (ADR 0003, đóng bởi ADR 0007)**: refresh token chuyển
      sang httpOnly cookie + CSRF double-submit, loại hẳn token khỏi mọi JS-accessible storage —
      xong 2026-07-14.
- [x] Migrate hai E2E project khỏi executor Jest deprecated sang Nx inferred target; bỏ
      `passWithNoTests`, thêm startup timeout và Economy HTTP E2E — xong 2026-07-13.
- [x] **UX audit toàn diện `apps/web`** (Playwright + trình duyệt thật, 2 user thật, core-api + signaling-gateway + LiveKit thật, không mock) — xong 2026-07-14. Phát hiện + sửa trong cùng đợt:
- [x] Party Room: effect tự-kết-nối-lại lặp vô hạn khi gặp lỗi (bắt được 1636 request `join` trong ~6s, không backoff) — sửa bằng ref "đã tự thử chưa", chỉ tự thử 1 lần; mục checklist mới ở [10 § 10.1.C](./10-code-review-checklist.md)
- [x] Bong bóng tin nhắn của đối phương vô hình ở Soul Match chat + Friend chat do `--card` trùng `--background` — sửa token màu
- [x] Party Room: host giờ mời được khán giả lên nói (trước đây chỉ có chiều demote, không có chiều promote dù backend đã hỗ trợ)
- [x] Đăng nhập OTP: autofocus ô SĐT/mã OTP, nút "Gửi lại mã" + đếm ngược 30s
- [x] Voice Match: đồng hồ đếm thời lượng cuộc gọi khi đang diễn ra (trước chỉ hiện tổng thời lượng sau khi kết thúc)
- [x] **Hạ tầng — webhook LiveKit không bao giờ hoạt động, sửa xong 2026-07-14**: 2 lỗi độc lập chặn `Calling`/`Party Room` nhận sự kiện thật từ LiveKit, cả hai đã sửa + có test:
  1. Webhook URL (`apps/media-server/livekit.yaml`) thiếu prefix `/api/v1` → 404 âm thầm — đã sửa URL.
  2. `apps/core-api/src/main.ts`: LiveKit gửi `Content-Type: application/webhook+json` (không phải `application/json`) — `rawBody` mặc định của Nest chỉ khớp đúng `application/json` nên bỏ qua request này, verify chữ ký luôn fail 401. Sửa bằng cách tắt auto body-parser (`bodyParser: false`) và tự đăng ký cả 2 parser tường minh. **Gotcha suýt gây regression toàn API**: nếu để Nest tự đăng ký parser mặc định RỒI mới tự thêm 1 `express.json()` riêng cho content-type LiveKit, Nest sẽ tưởng `'application/json'` đã có parser (dedup theo TÊN HÀM middleware, không theo content-type filter) và ÂM THẦM BỎ QUA parser thật — vỡ toàn bộ request JSON bình thường. Bắt được bằng smoke test `guest login` trước khi tin fix, không chỉ tin theo webhook test đơn lẻ.
  3. Test mới: `apps/core-api-e2e/src/core-api/livekit-webhook-content-type.spec.ts` (dựng JWT ký thật bằng `AccessToken.sha256` như SDK tự test) + verify sống bằng Playwright (đồng hồ gọi tăng đúng theo giây: 0:00 → 0:08).
- [x] **Party Room — host rớt kết nối ngoài ý muốn không còn đá cả phòng ra ngay** — xong 2026-07-14, phát hiện tiếp qua cùng đợt dogfooding trên. Webhook `participant_left` cho host giờ chỉ set `hostDisconnectedAt` (grace `PARTY_HOST_DISCONNECT_GRACE_SECONDS`, mặc định 15s) thay vì đóng phòng ngay; host tự kết nối lại trong lúc chờ thì huỷ lịch đóng (idempotent, không race với sweeper nhờ cùng lock row). REST `leaveRoom` chủ động vẫn đóng ngay như cũ, không qua grace. Chi tiết: [services/party-room-service.md § 4](./services/party-room-service.md).

---

[← 06 · Domain Rules](./06-domain-rules.md) · [08 · Working with Agents →](./08-working-with-agents.md)
