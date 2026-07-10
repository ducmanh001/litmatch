[← 06 · Domain Rules](./06-domain-rules.md) · **07 · Roadmap** · [08 · Working with Claude Code →](./08-working-with-claude-code.md)

# 7. Checklist triển khai theo giai đoạn

> **Current focus (2026-07-10): Giai đoạn 2A — production-readiness gate trước M2/M3.** M1 và provider adapter Economy đã có implementation, nhưng chưa được gọi là production-ready.

## Cách đọc trạng thái

- `[x]` chỉ có nghĩa task nhỏ trên đúng dòng đã đạt acceptance của nó; không suy ra cả phase hoặc production đã xong.
- `[ ]` là gate còn mở. “Đã code”, “integration-verified”, “provider-verified” và “production-ready” là các trạng thái khác nhau theo [11 § 11.1](./11-nfr-and-production-readiness.md).
- “... Service” trong roadmap mặc định là module NestJS trong `core-api`. Baseline có ba **server workload family**: `core-api`, `signaling-gateway`, LiveKit. Client/admin/worker/infrastructure không phải business service thứ tư; tách domain service cần ADR theo [03 § 3.4](./03-architecture.md).

## Giai đoạn 0 — Nền móng implementation

- [x] Monorepo Nx + pnpm + Node 22; `core-api`, `signaling-gateway`, thư mục deployment LiveKit và shared libs
- [x] Docker Compose local: PostgreSQL, Redis, Kafka
- [x] Auth: phone OTP, Google/Apple identity, guest, JWT + refresh rotation/reuse detection; Facebook để task riêng khi có nhu cầu
- [x] User profile cơ bản + avatar mặc định + server enforce tuổi tối thiểu khai báo
- [x] CI baseline lint/test/build/docker cho code đã commit
- [x] Shared libs: `common-exceptions`, `common-dtos`, `logger`, `config-validator`
- [ ] CI/ops đạt Definition of Done production (R-008: Redis integration, e2e, coverage, migration, docs/security/load/DR gates)

## Giai đoạn 1 — Economy implementation

- [x] Double-entry ledger append-only, DB trigger chặn UPDATE/DELETE, Wallet snapshot, Outbox, reconciliation implementation — [Economy spec](./services/economy-service.md)
- [x] VIP mua bằng diamond, gia hạn cộng dồn, derive expiry khi đọc
- [x] Apple/Google verifier adapter và Dev verifier đã được viết
- [x] Refund/reversal + negative debt behavior đã có integration test trên Postgres
- [ ] **IAP production-ready**: chưa đạt — provider sandbox/credential/webhook thật chưa chạy; Apple flow còn dùng deprecated `verifyReceipt` và có known consumable transaction-selection bug; Google acknowledge/consume/PENDING lifecycle chưa được gate (R-004)
- [ ] Economy idempotency/reversal/audit contract production (R-005)

## Giai đoạn 2A — Architecture & production-readiness gate

Các dòng “docs complete” chỉ xác nhận tài liệu đã được sửa; runtime/provider evidence vẫn nằm ở gate tương ứng.

- [x] **R-001 — Scope/workload invariant**: phân biệt ba server workload baseline với client/admin/worker/infrastructure; README/CLAUDE/Architecture dùng cùng thuật ngữ
- [x] **R-002 — NFR baseline**: capacity envelope, SLO, data safety/security và release gates được ghi ở [11-nfr-and-production-readiness.md](./11-nfr-and-production-readiness.md); evidence registry vẫn phải điền trước release
- [x] **R-003 — LiveKit architecture spec**: single-node-per-room self-host, direct client media, token/RoomService/webhook responsibility và Mermaid diagram đã chốt ở [03 § 3.2-3.5](./03-architecture.md)
- [ ] **R-004 — IAP provider gate**: Apple StoreKit 2 signed transaction/App Store Server API exact transaction ID; validate bundle/environment/product/account binding; Google `PURCHASED`/`PENDING` + server consume/ack; durable RTDN/ASN inbox; sandbox E2E purchase/replay/refund/revoke
- [ ] **R-005 — Idempotency/ledger hardening**: scoped operation+actor key, canonical request hash, PostgreSQL conflict algorithm đúng, idempotent replay response, reversal uniqueness/partial-refund policy, actor audit và event catalog/Inbox
- [x] **R-006a — Matching M1 spec backfill**: state/storage/API/sharding/fairness/durability gaps được ghi ở [services/matching-service.md](./services/matching-service.md)
- [ ] **R-006b — Matching runtime gate**: queue outbox/full reconcile + worker lease + scoped idempotency/durable speed-up đã implement; còn idempotent session create, operation recovery worker, active-shard cleanup, widening/fairness và chaos/load/multi-instance evidence
- [ ] **R-007a — Safety foundation implementation**: migration/entities/service/controller cho directed Block, Report intake, evidence metadata reference, scoped idempotency và append-only audit + Postgres race/IDOR/rate-limit tests. Foundation đang được triển khai; chỉ tick khi API/module/test cùng pass — [Safety spec § 2/14](./services/safety-service.md)
- [ ] **R-007b — Safety full launch gate**: moderation case/decision/enforcement/appeal; age assurance; device/account policy; evidence storage/retention/access; emergency/minor escalation; synchronous enforcement ở Matching/Message/Call/Party/Gift/Feed; SLO/ops/security evidence — [Safety spec](./services/safety-service.md)
- [ ] **R-008 — CI/Ops gate**: CI có Postgres+Redis integration/e2e/coverage/migration/docs/security; image/version pin; dashboards/alerts/runbooks; backup/PITR restore drill; SLO/load evidence

**Blocker**: không bật IAP store thật, anonymous matching public hoặc Message/Voice/Party production trước khi gate tương ứng pass; R-007a foundation **không thay thế R-007b launch gate**. Evidence nằm ở [11 § 11.8](./11-nfr-and-production-readiness.md).

## Giai đoạn 2 — Matching lõi (M1/M2/M3)

### M1 — Matching engine

- [x] **Implementation snapshot**: `MatchTicket` state machine; Postgres business state; create/speed-up scoped idempotency + request hash; queue outbox/full reconcile; Redis shard + claim lease; criteria hai chiều; durable speed-up operation/compensation; sweeper queue/confirm timeout; integration tests local cho các race chính
- [ ] **Production-ready M1**: chỉ tick khi R-005, R-006b, R-007b phần Matching create+pair và R-008 evidence pass

### M2 — Soul Match + friend funnel

- [ ] M2A anonymous chat: transport, room/session authorization, retention/deletion và moderation hooks
- [ ] M2B two-sided evaluation: rude/boring/like; transition/idempotency; profile chỉ unlock khi cả hai like
- [ ] M2C atomic `Friendship` + long-lived `Conversation`/`Message`; Block/Report áp dụng cho lịch sử và tương tác mới
- [ ] M2D disconnect/no-show/retry/race/security/e2e tests

### M3 — Voice Match + Calling

- [ ] M3A CallSession state machine + room/token contract + server-authoritative lifecycle
- [ ] M3B Socket.IO application session/presence; **không proxy LiveKit SDP/ICE**; Redis adapter khi multi-instance
- [ ] M3C LiveKit direct-client integration: room-scoped token, public WebRTC/TURN, private RoomService, signed durable webhook + reconciliation
- [ ] M3D Billing: server time, price snapshot, reconnect pause, insufficient-balance end, idempotent tick/settle/refund
- [ ] M3E failure/race/load/security tests theo [11](./11-nfr-and-production-readiness.md)

## Giai đoạn 3 — Party Room + Gift

- [ ] Party Room role/state machine: host/speaker/audience, host transfer/close, room lock, speaker/participant cap server-side
- [ ] LiveKit multi-party trong giới hạn **một room/node**; load test theo `speaker × subscriber`, không giả định `N×(N-1)`
- [ ] Gift catalog + realtime effect chỉ sau Economy commit; DIA/PTS hai chân cùng DB transaction
- [ ] Chốt policy reverse PTS/debt trước khi code refund Gift — [Economy § 6](./services/economy-service.md)

## Giai đoạn 4 — Social layer

- [ ] Mở rộng Safety sau R-007b: trust-score experiment có audit/appeal, abuse analytics, automation chỉ trong policy boundary — [Safety spec](./services/safety-service.md)
- [ ] Feed: post/like/comment + visibility/block/delete/cache consistency
- [ ] Avatar catalog/inventory/ownership
- [ ] Notification push FCM/APNs + in-app qua event outbox/inbox

## Giai đoạn 5 — Content phụ trợ

- [ ] Movie Match: playback sync + content/provider policy
- [ ] Palm Match: template/random theo input, disclosure nội dung giải trí
- [ ] Mini game — ưu tiên thấp nhất sau các mục trước

## Giai đoạn 6 — Scale & operational maturity

> Minimum observability/security/backup đã là R-008; phase này mở rộng theo số liệu, không phải lần đầu thêm monitoring.

- [ ] Horizontal scale Socket.IO bằng Redis adapter + connection draining
- [ ] Kubernetes/IaC/autoscale với resource/cost budget và rollback
- [ ] Full metrics/tracing xuyên Matching → Calling → Economy + SLO/error budget
- [ ] Load/soak/chaos định kỳ, dependency/container/IaC security gate
- [ ] Kafka consumer lag/DLQ/replay, Postgres capacity/PITR và Redis rebuild drills

## Giai đoạn 7 — Vận hành quy mô lớn theo bằng chứng

- [ ] LiveKit self-host multi-node để phân phối **room mới** qua Redis/node selector; graceful draining và region-aware routing. Không giả định một room tự cascade qua node
- [ ] Nếu một room/global-edge vượt single-node requirement: ADR đánh giá LiveKit Cloud hoặc kiến trúc khác
- [ ] Thêm matcher worker/shard/region khi NFR/dashboard chứng minh hot shard; không phá preference/fairness
- [ ] Tăng tần suất/partition reconciliation ledger và paging; cân nhắc partition/TigerBeetle chỉ sau benchmark Postgres
- [ ] Tách module khỏi `core-api` khi đạt tiêu chí [03 § 3.4](./03-architecture.md), có migration/rollback/ownership
- [ ] Multi-region data/media/signaling với data-residency, failover, RPO/RTO drill
- [ ] Feed CQRS/read replica/fanout strategy theo follower/read-write distribution thật
- [ ] Chaos test kill worker/node/DB connection trong Economy/Matching/Calling và chứng minh idempotency/outbox/inbox/rebuild

---
[← 06 · Domain Rules](./06-domain-rules.md) · [08 · Working with Claude Code →](./08-working-with-claude-code.md)
