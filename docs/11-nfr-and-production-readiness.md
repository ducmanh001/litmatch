[← 10 · Code Review Checklist](./10-code-review-checklist.md) · **11 · NFR & Production Readiness** · [Sources →](./sources.md)

# 11. NFR, capacity assumptions và production-readiness gates

Tài liệu này biến mục tiêu “quy mô lớn” thành giả định đo được. Số dưới đây là **planning envelope v0**, không phải tuyên bố hệ thống hiện đã chịu được tải đó. Trước public launch, Product/Engineering/SRE phải duyệt forecast và gắn bằng chứng test vào § 11.8.

## 11.1 Thuật ngữ trạng thái

| Trạng thái | Ý nghĩa |
|---|---|
| `specified` | Contract/decision đã ghi trong docs, chưa chứng minh runtime |
| `implemented` | Code/migration đã có và unit test pass |
| `integration-verified` | Đã test với dependency thật tương ứng |
| `provider-verified` | Đã test sandbox/staging của provider bên ngoài |
| `production-ready` | Tất cả gate áp dụng ở § 11.7 có evidence, rollback và owner |
| `production-validated` | Đã chạy production trong SLO, có dashboard/alert/runbook |

Checkbox roadmap chỉ được hiểu theo mô tả task. “Implemented” không đồng nghĩa “production-ready”.

## 11.2 Planning envelope v0

Các profile độc lập để test bottleneck; không cộng máy móc mọi hàng thành một workload duy nhất.

| Profile | Giả định v0 cho một active region | Gate đo |
|---|---:|---|
| Application realtime | 10.000 Socket.IO connection đồng thời | 2× forecast peak trong 30 phút; 1× trong 4 giờ soak |
| Voice Match 1-1 | 1.000 room đồng thời / 2.000 media participant | LiveKit load test đúng codec/bitrate/instance production |
| Party audio | 50 room × 200 participant, tối đa 8 speaker/room | Test subscription topology `S × (N-1)`, không giả định tất cả publish |
| Matching ingress | 100 create/cancel/confirm request mỗi giây | Không match đôi; wait-time/fairness không vi phạm § 11.3 |
| Economy writes | 50 transaction tiền mỗi giây, burst 5× trong 60 giây | Zero invariant mismatch, zero duplicate effect |
| Core REST | 1.000 read RPS + 250 write RPS | p95/p99/error-rate theo § 11.3 |

Forecast phải cập nhật bằng analytics thật theo region, giờ cao điểm, loại client và feature mix. Khi forecast vượt envelope, tạo capacity ADR trước khi tăng traffic; không suy ra một node chịu được toàn profile.

## 11.3 SLO v0

| Luồng | SLI | Mục tiêu v0 |
|---|---|---:|
| Core API | latency không tính provider ngoài | p95 ≤ 300 ms, p99 ≤ 800 ms |
| Core API | 5xx ngoài maintenance | < 0,5% request / 5 phút và < 0,1% / tháng |
| Matching engine | thời gian từ khi hai candidate tương thích đã cùng shard tới DB pair commit | p95 ≤ 1 giây |
| Matching product | queue wait theo region/shard/tier | dashboard p50/p95/p99; alert khi p95 > target Product đã duyệt 15 phút |
| Socket.IO | server receive → client event cùng region | p95 ≤ 250 ms |
| Voice | token issued → hai participant joined | p95 ≤ 5 giây, tách lỗi client/network/provider |
| Economy | local ledger transaction | p95 ≤ 500 ms; timeout không được tạo duplicate effect |
| Economy | double-entry/rebuild/reconciliation | **0** mismatch chưa được acknowledge |
| Availability | core/signaling public path | ≥ 99,9% tháng ở public launch |

SLO Voice/Party phải phân đoạn theo network type/region. Metric vendor benchmark không thay thế synthetic test trên hạ tầng sẽ deploy.

## 11.4 Data safety, backup và disaster recovery

- PostgreSQL production phải có HA, encrypted backup/PITR và restore drill. Mục tiêu DR v0: **RPO ≤ 5 phút, RTO ≤ 60 phút**; ledger/outbox đã ACK trong failover cùng region không được mất.
- Redis matching queue là dữ liệu dẫn xuất: chấp nhận mất Redis **chỉ khi** rebuild được toàn bộ ticket `queued` từ Postgres và không match đôi.
- Kafka retention phải dài hơn outage/restore window của consumer; mỗi consumer có Inbox/dedup, retry/DLQ và replay runbook.
- Ledger/audit append-only không miễn trừ privacy: PII phải tách/pseudonymize để account deletion không phá bất biến tài chính.
- Migration có forward/backward compatibility, backup/rollback plan và test trên bản sao dữ liệu có kích thước đại diện.

## 11.5 Media/network production gate

Trước khi bật Voice/Party cho traffic thật:

- TLS/WSS, UDP/TCP port, TURN fallback, firewall/NAT và public IP đã test từ các network di động mục tiêu.
- LiveKit image/Helm version được pin; không deploy tag `latest`.
- Token có TTL ngắn, room/identity/grant tối thiểu; backend validate ownership trước khi mint.
- Signed webhook được persist vào durable inbox trước ACK; duplicate/out-of-order event không phá state.
- Một room nằm trên một self-host node; participant/speaker cap không vượt capacity test của node đó.
- Multi-node có Redis, load-aware placement, readiness/draining và test node termination khi đang có room.
- Dashboard tối thiểu: room/participant/node, join latency, disconnect reason, packet loss/jitter/RTT, CPU/network saturation, webhook lag/error.

## 11.6 Security, privacy và trust & safety gate

- Có threat model cho Auth, Economy/IAP, Matching, Messaging, Signaling/LiveKit và Admin.
- Secret đi qua secret manager; có rotation/revocation, least privilege, audit và không log OTP/token/receipt/message.
- Data classification + retention/deletion/export policy được duyệt; encryption in transit/at rest và admin RBAC/break-glass được test.
- Anonymous matching không public trước khi có age-assurance policy, Block/Report enforcement, moderation queue, evidence retention, escalation và appeal.
- Dependency/container/IaC scan, SBOM và penetration test cho public boundary trước launch.

## 11.7 Gate theo thời điểm

| Gate | Khi nào | Điều kiện bắt buộc |
|---|---|---|
| G0 — Spec ready | Trước code high-risk | Service spec, state machine, source-of-truth, failure model, NFR và security assumptions |
| G1 — Merge ready | Trước merge | Lint/unit/integration liên quan, migration test, review § 10, docs/code đồng bộ |
| G2 — Release candidate | Trước staging sign-off | E2E dependency thật, load/soak theo forecast, dashboards/alerts/runbook, rollback |
| G3 — Provider/production activation | Trước bật store/media/push thật | Provider sandbox, secret/key rotation, webhook replay, backup/restore, safety/privacy sign-off |
| G4 — Scale change | Trước tăng cap/node/region hoặc tách service | Capacity evidence, cost, failure drill, ADR và rollback |

Economy, IAP, Matching và Media không được bỏ G0/G2/G3 chỉ vì unit/integration test pass.

## 11.8 Evidence registry

Mỗi lần chạy gate, thêm link tới CI artifact/dashboard/report/ADR; không ghi “đã test” chỉ bằng mô tả prose.

| Gate/task | Environment + version | Evidence | Owner | Date | Result |
|---|---|---|---|---|---|
| R-004 IAP provider sandbox | Chưa chạy | — | Chưa gán | — | Open |
| R-006 Matching durability/fairness | Queue outbox/reconcile, lease claim, scoped idempotency và durable speed-up đã implement local; chaos/fairness/session/CI gate còn mở | — | Chưa gán | — | Open |
| R-008 load/DR/ops baseline | Chưa chạy | — | Chưa gán | — | Open |

---
[← 10 · Code Review Checklist](./10-code-review-checklist.md) · [Sources →](./sources.md)
