# Litmatch-style System

Hệ thống social-entertainment kiểu Litmatch: voice/text matching ẩn danh (Soul Match, Voice Match), phòng nhóm voice (Party Room), Feed, avatar ẩn danh, và 1 hệ kinh tế diamond (Economy) xuyên suốt để monetize toàn bộ. Xem đầy đủ ở [`docs/01-product-features.md`](./docs/01-product-features.md).

Mục tiêu thiết kế: quy mô Litmatch thật (hàng trăm nghìn – hàng triệu người dùng đồng thời), **không phải MVP** — nhưng vẫn build tuần tự theo modular monolith trước, tách microservice khi có số liệu thật cần, xem [`docs/03-architecture.md`](./docs/03-architecture.md).

## Trạng thái hiện tại

- **Giai đoạn 0 (Nền móng) — xong**: monorepo Nx + pnpm + Node 22, 3 app (`core-api`, `signaling-gateway`, `media-server`), docker-compose local (Postgres/Redis/Kafka), Auth + User module, CI, shared libs.
- **Giai đoạn 1 (Economy) — đang triển khai**: đã có khung double-entry ledger trong `apps/core-api/src/modules/economy` (LedgerAccount/LedgerEntry/Transaction/Wallet/IAP/Outbox); đặc tả chi tiết ở [`docs/services/economy-service.md`](./docs/services/economy-service.md), gồm refund/chargeback, gift 2-chân, versioned pricing, idempotency.

Xem trạng thái chi tiết theo giai đoạn ở [`docs/07-roadmap.md`](./docs/07-roadmap.md) (tick `[x]` thủ công khi hoàn thành).

## Cấu trúc repo

```
.
├── CLAUDE.md              ← Claude Code tự đọc file này ở đầu mỗi session (mọi thư mục con)
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
│   ├── 08-working-with-claude-code.md
│   ├── 09-practical-notes.md
│   ├── 10-code-review-checklist.md ← quan trọng nhất: tự review trước khi báo "xong"
│   └── sources.md
├── apps/
│   ├── core-api/            ← modular monolith chứa toàn bộ business logic (auth, user, matching, economy, social, content, moderation, notification, gift...)
│   ├── signaling-gateway/   ← WebSocket, connection-bound, tách riêng để scale ngang
│   └── media-server/        ← mediasoup/LiveKit, sidecar, không business logic
└── libs/                    ← shared libraries dùng chung giữa các app (common-exceptions, common-dtos, logger, config-validator...)
```

## Bắt đầu

1. Đọc [`docs/00-overview-and-index.md`](./docs/00-overview-and-index.md) — mục lục đầy đủ.
2. Đọc [`docs/03-architecture.md`](./docs/03-architecture.md) — quyết định kiến trúc quan trọng nhất, đặc biệt § 3.8 (SFU, matching shard, ledger cho quy mô lớn).
3. Giao cho Claude Code theo đúng gợi ý ở [`docs/08-working-with-claude-code.md`](./docs/08-working-with-claude-code.md), bắt đầu từ Giai đoạn 0 trong [`docs/07-roadmap.md`](./docs/07-roadmap.md).

## Nguyên tắc cốt lõi (chi tiết đầy đủ trong `docs/`, xem `CLAUDE.md` cho bản tóm tắt agent dùng)

- **Modular monolith trước**: chỉ 3 thành phần deploy riêng (`core-api`, `signaling-gateway`, `media-server`), mọi domain khác là module bên trong `core-api`.
- **Economy = double-entry ledger**: `LedgerEntry` là nguồn sự thật, `Wallet.balance` chỉ là snapshot dẫn xuất.
- **Review theo phương pháp luận, không chỉ theo checklist kỹ thuật**: `docs/10-code-review-checklist.md` § 10.0 dạy cách tìm lỗi logic nghiệp vụ (business logic vulnerability) — loại lỗi mà linter/scanner không bắt được.
