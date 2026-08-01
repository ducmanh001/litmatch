[← 06 · Domain rules](./06-domain-rules.md) · **07 · Roadmap** · [08 · Working with agents →](./08-working-with-agents.md)

# 7. Roadmap theo milestone và trigger

Roadmap trả lời **làm gì tiếp theo và điều kiện nào mở khóa**, không phải nguồn trạng thái feature.
Trạng thái code-backed nằm ở [`feature-registry.json`](./feature-registry.json); chi tiết behavior
nằm trong service spec; quyết định cũ nằm trong ADR/dated plans. `[x]` dưới đây nghĩa repository có
evidence cho outcome nêu rõ, không có nghĩa đã chạy production.

Tên “service” trong milestone là module NestJS của `core-api`, trừ hai deployable kỹ thuật
`signaling-gateway` và `media-server`. Deployable thứ tư vẫn cần số liệu + ADR theo
[03 § 3.4](./03-architecture.md).

## 7.1 Snapshot

| Track                                          | Repository outcome                                                                                 | Khoảng trống không được suy diễn                                                       |
| ---------------------------------------------- | -------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------- |
| Foundation, Economy, Matching, Social, Content | Source/contract/test evidence đã có cho các capability được registry đánh dấu `implemented`.       | Registry không chứng minh production traffic, provider credential hoặc store approval. |
| Frontend                                       | Admin và Web có route/hợp đồng chính, generated API client và runtime capability gating.           | Một số provider/UX entry point vẫn deferred; mockup không phải backend contract.       |
| Scale/operations                               | K8s/Compose/hosted profiles, observability, load-test scaffold và reliability evidence gate đã có. | Multi-region thật, production capacity benchmark và SLA chưa được chứng minh bởi repo. |

## Giai đoạn 0 — Nền móng

- [x] Nx + pnpm + Node 22, Core API, Signaling Gateway, Media Server, Admin, Web và shared libs.
- [x] PostgreSQL/Redis/Kafka local, migration workflow, CI/local gate và contract generation.
- [x] Auth/User baseline: guest, OTP/social adapters, refresh rotation và profile.

Evidence: [architecture](./03-architecture.md), [tech stack](./04-tech-stack.md),
[local development runbook](./runbooks/local-development.md) và resolved Nx project config.

## Giai đoạn 1 — Economy

- [x] Double-entry, append-only ledger; wallet snapshot; DB-unique transaction idempotency.
- [x] payOS web top-up, native IAP adapter boundary, VIP, refund/chargeback reversal và
      reconciliation/outbox.
- [ ] Chạy Apple/Google sandbox/production credential flow và lưu operational evidence trước khi
      gọi native IAP là available.

Canonical detail: [Economy spec](./services/economy-service.md). Không mở đường tắt cộng/trừ wallet
trực tiếp để “hoàn tất” provider.

## Giai đoạn 2 — Matching lõi

- [x] Ticket state machine, Redis shard/index, matcher worker, `canPair`, speed-up và direct invite.
- [x] Soul Match, Voice Match/Calling, Friend/Conversation và realtime fanout.
- [x] Guest matching quota theo user/device/network và API nâng cấp guest giữ cùng identity.
- [ ] Bổ sung UX nâng cấp guest ở client; endpoint tồn tại không tự tạo một user journey hoàn chỉnh.
- [ ] Bung matcher/shard mới chỉ khi queue depth/latency theo region có production evidence.

Canonical detail: [Matching](./services/matching-service.md),
[Soul Match](./services/soul-match-service.md), [Calling](./services/calling-service.md) và
[Friend](./services/friend-service.md).

## Giai đoạn 3 — Party Room và Gift

- [x] Party membership/role/cap/lifecycle, LiveKit token/grant control và disconnect grace.
- [x] Gift catalog/event với DIA debit + PTS credit trong transaction Economy.
- [ ] Benchmark workload Party Room thật trước khi nới member/speaker cap; thêm LiveKit node không
      chia một room qua nhiều node.
- [ ] Chốt refund policy cho gift nếu product yêu cầu; correction vẫn phải đi qua reversal.

## Giai đoạn 4 — Social, discovery và safety

- [x] Feed, audience, Stories, Avatar, Discovery/Nearby, Mood, Streak, Notification và Safety.
- [x] Admin operations cho user/moderation/economy/catalog/config/permission/support.
- [x] Admin room list/member counts/force-close và published-video list/remove dùng admin
      permission + audit path thật.
- [ ] Push provider production và user-warning API cần contract/backend riêng trước khi thêm UI.
- [ ] Re-enable visible short-video report action chỉ sau product decision + behavior test; backend
      report contract tồn tại không đồng nghĩa UI capability đang bật.

## Giai đoạn 5 — Content phụ trợ

- [x] Movie Match có friend mode và anonymous queue/chat/rating; Palm Match có anonymous
      queue/flip/compatibility/rating; Mini Game RPS.
- [x] Short-video lifecycle, ranking, interaction, report/moderation và provider ports.
- [ ] Cấu hình storage/transcode/moderation provider production trước khi bật video upload ngoài
      development.

## Giai đoạn 6 — Scale và observability

- [x] Socket.IO Redis adapter + distributed connection quota; OTel metrics/tracing; Sentry error
      path; Grafana/hosted runbooks.
- [x] Compose/K8s/hosted release artifacts, load-test scripts và reliability SLO/evidence gate.
- [x] Ledger reconciliation metrics/alerts và fault-oriented integration/chaos test source.
- [ ] Chạy load/chaos/reliability profile trong môi trường đại diện production và lưu artifact/SHA.
      Script/alert tồn tại chỉ là readiness của repository.

## Giai đoạn 7 — Vận hành theo bằng chứng

| Priority | Outcome cần đạt                                           | Trigger mở khóa / evidence bắt buộc                                                                |
| -------- | --------------------------------------------------------- | -------------------------------------------------------------------------------------------------- |
| P0       | Provider readiness cho top-up, push, video và social auth | Credential/sandbox smoke, runtime `/capabilities`, owner và rollback rõ                            |
| P0       | Production SLO baseline và alert ownership                | `reliability:production-gate`, dashboard/alert links, observation window đủ dài theo runbook       |
| P1       | LiveKit capacity/headroom thật                            | Chạy profile đúng codec/bitrate/publisher/subscriber trên cluster mục tiêu; không dùng placeholder |
| P1       | Multi-region thứ hai                                      | Budget/cluster/domain thật, region code/URL thật, DNS/LB smoke và failover evidence                |
| P1       | Scale matcher/shard                                       | Queue depth, wait latency và contention theo region vượt SLO đã chốt                               |
| P2       | Tách module thành deployable                              | Ít nhất một tiêu chí § 3.4 + ADR + migration/rollback + observability; không chỉ vì module lớn     |
| P2       | Feed CQRS/read replica/cache mới                          | **số liệu traffic production thật** về read/write, latency, hit rate và freshness budget           |
| P2       | Thuật toán ranking/matching phức tạp hơn                  | Offline/online eval chứng minh uplift đủ bù fairness, explainability và vận hành                   |

Các item không có evidence vẫn để mở. Không tự bịa threshold để tick roadmap; ghi owner/trigger rõ
quan trọng hơn một ngày hoàn thành giả.

## Frontend track

- [x] OpenAPI → generated `api-client`, cookie refresh + CSRF và gate chống contract drift.
- [x] Admin/Web shell, auth, route chính, realtime/media singleton và runtime capability contract.
- [x] Admin operational pages và Web flows cho feed/matching/friend/party/wallet/profile/discovery/
      movie/palm/video theo contract hiện có.
- [ ] Guest-upgrade UX và các product decision còn mở ở Giai đoạn 2/4/5.
- [ ] Browser/device E2E cho provider thật chỉ chạy khi môi trường/credential tồn tại; unit/mock
      PASS không được nâng thành production claim.

### Public web, SEO và trust

- [x] Public information surface: landing, tính năng, cách hoạt động, about, contact, help,
      community guidelines, terms, privacy policy và cookie policy; footer không còn dead link `#`.
- [x] Technical SEO baseline: canonical theo public origin, metadata Open Graph/Twitter, JSON-LD
      cho Organization/WebSite/SoftwareApplication và các trang public, `robots.txt`, `sitemap.xml`,
      manifest, social preview image; route sau đăng nhập được `noindex`.
- [ ] Legal/product owner review nội dung terms, privacy, cookies và community guidelines trước
      khi công bố như chính sách pháp lý chính thức; bản source hiện là baseline theo behavior hiện có.
- [ ] Sau khi có domain production: khai báo Search Console, gửi sitemap, kiểm tra rich result,
      canonical, Core Web Vitals và cập nhật `NEXT_PUBLIC_SITE_URL` đúng public web URL.
- [ ] Đo organic acquisition và AI-search citations bằng dữ liệu thật trước khi tuyên bố SEO đã
      đạt mục tiêu; JSON-LD/SSR giúp máy hiểu nội dung nhưng không đảm bảo thứ hạng hay việc được trích dẫn.

Route map hiện hành nằm trong `apps/admin/AGENTS.md`, `apps/web/AGENTS.md` và source route tree.
Visual reference ở [`layouts/`](../layouts/README.md) chỉ định hướng presentation; backend/OpenAPI/
domain docs thắng khi mockup mâu thuẫn.

## 7.2 Cách cập nhật roadmap

1. Không copy danh sách feature implemented từ registry sang đây.
2. Outcome hoàn tất phải link owner canonical/evidence; production outcome phải có operational
   artifact, không chỉ source.
3. Work deferred phải có trigger mở lại; nếu trigger không biết, ghi owner/decision còn thiếu.
4. Chi tiết điều tra/verification dài chuyển vào [dated plans/reviews](./plans/README.md); roadmap
   chỉ giữ quyết định và bước tiếp theo.
5. Thay đổi durable architecture cần ADR; roadmap không có quyền tự nới invariant.

---

[← 06 · Domain rules](./06-domain-rules.md) · [08 · Working with agents →](./08-working-with-agents.md)
