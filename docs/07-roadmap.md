[← 06 · Domain Rules](./06-domain-rules.md) · **07 · Roadmap** · [08 · Working with Agents →](./08-working-with-agents.md)

# 7. Checklist triển khai theo giai đoạn

> **Ghi chú thuật ngữ**: trong toàn bộ file này, tên gọi "... Service" (Auth Service, Matching Service, Economy Service...) nghĩa là **module NestJS bên trong `apps/core-api`** (đúng cấu trúc [03-architecture.md § 3.2](./03-architecture.md) và [05-coding-standards.md § 5.3](./05-coding-standards.md)), KHÔNG phải service deploy riêng — chỉ `core-api`, Signaling Gateway, Media Server mới là 3 thành phần deploy độc lập xuyên suốt dự án (trừ khi 1 module đã đủ tiêu chí tách ở [03-architecture.md § 3.4](./03-architecture.md), ghi rõ ở Giai đoạn 7 bên dưới).
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

## Giai đoạn 3 — Party Room + Gift

- [x] Party Room module: tạo phòng, quản lý role host/speaker/audience, **giới hạn cứng số speaker/phòng theo config** (`PARTY_MAX_SPEAKERS`, snapshot lên phòng lúc tạo; cap check DƯỚI lock FOR UPDATE row phòng — chặn race 2 request promote đồng thời, § 3.8.A) — [services/party-room-service.md](./services/party-room-service.md). Host rời → **đóng phòng** (không transfer host ở GĐ3); membership enforce ở DB bằng partial unique (1 user 1 phòng active); sweeper đối chiếu DB↔SFU làm backstop khi webhook rớt
- [x] Mở rộng SFU cho multi-party: port riêng grant theo role (audience `canPublish=false` NGAY TỪ TOKEN), đổi grant runtime qua `updateParticipant` đợi ACK trong transaction, tạo room tường minh với `maxParticipants`/`emptyTimeout`, webhook URL thứ 2 `party/webhooks/livekit` (livekit.yaml); env LiveKit đổi thành `LIVEKIT_*` dùng chung calling + party
- [x] Gift module: catalog quà (giá là data DB, server re-check tại thời điểm tặng), tặng quà realtime (`gift.sent` publish SAU commit), trừ diamond + cộng **điểm quy đổi** (`GIFT_POINTS_RATE_PERCENT`, guest nhận 0 điểm — docs/06) trong **cùng 1 DB transaction** qua `EconomyService.sendGift` (2 chân độc lập tự cân theo currency, GiftEvent ghi qua withinTransaction) — [services/gift-service.md](./services/gift-service.md). Hoàn tiền gift CHƯA làm (quyết định mở ở [services/economy-service.md § 6](./services/economy-service.md)). **Giai đoạn 3 hoàn tất.**

## Giai đoạn 4 — Social layer

- [ ] Feed module: post, like, comment
- [ ] Avatar module: catalog item, ghép avatar
- [ ] Report/Block, trust score ảnh hưởng matching
- [ ] Notification module: push (FCM/APNs) + in-app cho match thành công, tin nhắn mới, nhận gift, like/comment — consumer của các event đã publish qua outbox, không chen vào luồng chính

## Giai đoạn 5 — Content phụ trợ

- [ ] Movie Match: đồng bộ playback qua WebSocket
- [ ] Palm Match: template content, random theo input
- [ ] Mini game (ưu tiên thấp nhất toàn dự án — chỉ bắt đầu khi mọi mục trước của giai đoạn này đã xong)

## Giai đoạn 6 — Scale & Observability

- [ ] Horizontal scale Signaling Gateway (Redis adapter cho Socket.IO)
- [ ] Kubernetes deployment + autoscale
- [ ] Monitoring: Prometheus metrics (matching latency, call drop rate, transaction failure rate)
- [ ] Distributed tracing xuyên suốt Matching → Calling → Economy
- [ ] Load test (k6/Artillery)

## Giai đoạn 7 — Vận hành ở quy mô thật (Litmatch-scale, không còn là MVP)

> Vì ledger double-entry (Giai đoạn 1) và ticket/shard cho Matching (Giai đoạn 2) đã được **thiết kế đúng ngay từ đầu**, Giai đoạn 7 không phải là sửa lại thiết kế — mà là **vận hành/mở rộng thực sự** những gì đã thiết kế sẵn, khi số liệu traffic thật xác nhận cần (đúng tinh thần MonolithFirst ở § 3.1: quyết định _thiết kế_ chọn sớm, quyết định _khi nào bung ra hạ tầng thật_ thì chờ số liệu).

- [ ] Bật cascade SFU thật (LiveKit mesh nhiều node) khi số liệu xác nhận Party Room chạm ngưỡng vài nghìn consumer/node — xem § 3.8.A
- [ ] Bung thêm shard/matcher worker instance cho Matching Queue theo region mới hoặc tiêu chí mới khi traffic khu vực đó đủ lớn — xem § 3.8.B
- [ ] Mở rộng job đối soát (reconciliation) ledger chạy tần suất cao hơn + cảnh báo tự động khi phát hiện lệch Nợ/Có — xem § 3.8.C
- [ ] Tách các module đã đủ tiêu chí ở § 3.4 ra khỏi `core-api` thành service riêng (đo bằng số liệu thật: CPU/DB load, không đoán)
- [ ] Multi-region deployment cho Signaling Gateway + Media Server, routing user tới region gần nhất (giảm latency thoại)
- [ ] CQRS/read-replica cho Feed khi lượng đọc vượt xa lượng ghi (fanout-on-write hoặc fanout-on-read tuỳ tỉ lệ follower trung bình)
- [ ] Chaos testing cho luồng tiền (kill Economy giữa transaction, kill matcher giữa lúc ghép cặp) để xác nhận idempotency/outbox hoạt động đúng dưới lỗi thật, không chỉ đúng trên giấy

---

[← 06 · Domain Rules](./06-domain-rules.md) · [08 · Working with Agents →](./08-working-with-agents.md)
