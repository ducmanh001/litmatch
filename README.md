# Litmatch-style System

Hệ thống social-entertainment kiểu Litmatch: voice/text matching ẩn danh (Soul Match, Voice Match), phòng nhóm voice (Party Room), Feed, avatar ẩn danh, và 1 hệ kinh tế diamond (Economy) xuyên suốt để monetize toàn bộ. Xem đầy đủ ở [`docs/01-product-features.md`](./docs/01-product-features.md).

Mục tiêu thiết kế: quy mô Litmatch thật (hàng trăm nghìn – hàng triệu người dùng đồng thời), **không phải MVP** — nhưng vẫn build tuần tự theo modular monolith trước, tách microservice khi có số liệu thật cần, xem [`docs/03-architecture.md`](./docs/03-architecture.md).

## Trạng thái hiện tại

- **Backend Giai đoạn 0–3 — xong**: nền móng, Economy double-entry, Matching/Soul/Calling,
  Signaling realtime, Friend chat, Party Room và Gift đã có code + integration test. IAP/webhook
  store thật vẫn cần credential sandbox trước khi bật production.
- **Frontend core/base — xong**: `apps/admin` (Vite + React), `apps/web` (Next.js) và generated
  `libs/api-client`; feature UI thật tiếp tục theo frontend track trong roadmap.
- **Đang chờ**: Giai đoạn 4 Social/T&S, Task 0 backend cho admin và security gate browser trước
  public launch.

Xem trạng thái chi tiết theo giai đoạn ở [`docs/07-roadmap.md`](./docs/07-roadmap.md) (tick `[x]` thủ công khi hoàn thành).

## Cấu trúc repo

```
.
├── AGENTS.md              ← hợp đồng làm việc dùng chung cho mọi agent
├── README.md               ← file này
├── docs/                   ← toàn bộ đặc tả, bắt đầu từ docs/00-overview-and-index.md
│   ├── 00-overview-and-index.md
│   ├── 01-product-features.md
│   ├── 02-domain-model.md
│   ├── 03-architecture.md          ← quan trọng nhất: kiến trúc + quyết định scale
│   ├── 04-tech-stack.md
│   ├── 05-coding-standards.md
│   ├── 06-domain-rules.md
│   ├── 07-roadmap.md               ← checklist theo giai đoạn, tick khi xong
│   ├── 08-working-with-agents.md
│   ├── 09-practical-notes.md
│   ├── 10-code-review-checklist.md ← quan trọng nhất: tự review trước khi báo "xong"
│   ├── 11-engineering-principles.md ← la bàn thiết kế cho người đọc
│   ├── 12-frontend-architecture.md
│   ├── 13-frontend-coding-standards.md
│   ├── 14-rule-enforcement-matrix.md ← rule nào được chặn bằng máy, rule nào review tay
│   └── sources.md
├── apps/
│   ├── core-api/            ← modular monolith chứa toàn bộ business logic (auth, user, matching, economy, social, content, moderation, notification, gift...)
│   ├── signaling-gateway/   ← WebSocket, connection-bound, tách riêng để scale ngang
│   ├── media-server/        ← LiveKit self-host config/deployment, không business logic
│   ├── admin/               ← Vite + React SPA cho vận hành nội bộ
│   └── web/                 ← Next.js app cho end user
└── libs/                    ← shared libraries dùng chung giữa các app (common-exceptions, common-dtos, logger, config-validator...)
```

## Bắt đầu

1. Dùng Node.js 22 + pnpm 11.9, sau đó chạy `cp .env.example .env`.
2. Chạy `pnpm bootstrap` để cài dependency, khởi động Postgres/Redis/Kafka, chạy migration và kiểm tra môi trường. Những lần sau dùng `pnpm infra:up` và `pnpm doctor`.
3. Đọc [`docs/00-overview-and-index.md`](./docs/00-overview-and-index.md) — mục lục đầy đủ.
4. Đọc [`docs/03-architecture.md`](./docs/03-architecture.md) — quyết định kiến trúc quan trọng nhất, đặc biệt § 3.8 (SFU, matching shard, ledger cho quy mô lớn).
5. Agent làm việc theo [`AGENTS.md`](./AGENTS.md) và quy trình ở [`docs/08-working-with-agents.md`](./docs/08-working-with-agents.md).

Các lệnh hạ tầng thường dùng:

| Lệnh                                 | Mục đích                                                                               |
| ------------------------------------ | -------------------------------------------------------------------------------------- |
| `pnpm doctor`                        | Kiểm tra toolchain, `.env`, credential trong Git remote và trạng thái dependency local |
| `pnpm infra:up` / `pnpm infra:down`  | Bật/tắt hạ tầng local                                                                  |
| `pnpm infra:logs`                    | Theo dõi log Postgres/Redis/Kafka                                                      |
| `pnpm infra:reset`                   | **Xoá toàn bộ volume local** và tạo lại từ đầu                                         |
| `pnpm db:migrate` / `pnpm db:status` | Chạy hoặc xem trạng thái migration                                                     |
| `pnpm ci:local:quick`                | Mô phỏng job Format and lint của GitHub Actions, reset Nx cache để không tin cache cũ  |
| `pnpm ci:local:clean`                | Chạy quality gate trong Node 22 Linux container + `node_modules` rỗng, gần CI nhất     |
| `pnpm ci:local`                      | Chạy quick + Postgres/Redis + frontend/core test, build và E2E như CI                  |
| `pnpm ci:local:docker`               | Build, quét Trivy image Core API/Signaling và smoke health-check local; không deploy   |
| `pnpm ci:local:security`             | Chạy Gitleaks, `pnpm audit` và Trivy local; CLI tự tải theo version/SHA đã pin         |
| `pnpm ci:preflight`                  | Một lệnh trước PR: clean quality + security + test/build/E2E + image scan/smoke        |
| `pnpm ci:local:all`                  | Alias đầy đủ của preflight; CodeQL/dependency review vẫn chạy trên GitHub              |

Nên chạy `pnpm ci:local:quick` trong vòng lặp hằng ngày và `pnpm ci:preflight` trước khi mở/cập
nhật PR. Hook `pre-push` tự chạy quality gate trong Node 22 Linux với `node_modules` rỗng, nên lỗi
dependency ẩn bởi máy local bị chặn trước khi code lên GitHub. Lệnh Docker dùng database cô lập
`litmatch_ci` thay vì database dev; xem trước toàn bộ kế hoạch bằng `pnpm ci:local:plan`.

Các profile CI tắt Nx daemon/Husky và chạy actionlint + ShellCheck đã pin checksum, nên hành vi gần runner
GitHub và lỗi workflow YAML/expression được phát hiện ngay local.

Gitleaks quét cả lịch sử Git và dùng [baseline](./.gitleaks-baseline.json) gồm đúng ba finding
test giả lập đã xác minh. Baseline không phải allowlist chung: finding mới vẫn fail; chỉ cập nhật
khi đã review từng fingerprint.

## Nguyên tắc cốt lõi (chi tiết đầy đủ trong `docs/`, xem `AGENTS.md` cho bản tóm tắt agent dùng)

- **Modular monolith trước**: baseline chỉ 3 backend deployable; thay baseline cần số liệu + ADR
  cập nhật invariant/guard, không phải quyết định cục bộ của feature.
- **Economy = double-entry ledger**: `LedgerEntry` là nguồn sự thật, `Wallet.balance` chỉ là snapshot dẫn xuất.
- **Review theo phương pháp luận, không chỉ theo checklist kỹ thuật**: `docs/10-code-review-checklist.md` § 10.0 dạy cách tìm lỗi logic nghiệp vụ (business logic vulnerability) — loại lỗi mà linter/scanner không bắt được.
- **Thiết kế theo ownership và boundary**: đọc [`docs/11-engineering-principles.md`](./docs/11-engineering-principles.md) trước khi thêm abstraction, module hoặc đề xuất tách service.
