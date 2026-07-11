# Litmatch-style System

Backend platform cho social-entertainment kiểu Litmatch: Soul/Voice Match, Party Room, friend chat, social/content và Economy diamond. Feature map ở [`docs/01-product-features.md`](./docs/01-product-features.md).

Mục tiêu dài hạn là quy mô lớn, nhưng mọi scale claim phải có workload/SLO/evidence theo [`docs/11-nfr-and-production-readiness.md`](./docs/11-nfr-and-production-readiness.md). Kiến trúc bắt đầu bằng modular monolith, không gọi một module là microservice chỉ vì muốn scale “sau này”.

## Trạng thái hiện tại

- Giai đoạn 0: foundation implementation đã có.
- Giai đoạn 1: ledger/VIP/refund implementation đã có; **IAP chưa production-ready** vì provider sandbox chưa chạy, Apple `verifyReceipt` cần thay bằng signed transaction/App Store Server API và Google lifecycle cần acknowledge/consume gate.
- Giai đoạn 2 M1: matching implementation đã có trong working tree; **chưa production-ready** tới khi durability/idempotency/fairness/safety/CI gates pass.
- Current focus: **Giai đoạn 2A, R-001…R-008** trong [`docs/07-roadmap.md`](./docs/07-roadmap.md).

## Topology baseline

Ba **server workload family** ban đầu:

1. `core-api` — NestJS modular monolith chứa business domain.
2. `signaling-gateway` — Socket.IO cho application realtime/presence/control intent.
3. LiveKit self-host — WebRTC signaling/media; cấu hình local nằm ở `apps/media-server`.

Đây không phải lệnh cấm mobile/web/admin client, migration job, worker cùng codebase hay infrastructure dependency. Tách một business module khỏi `core-api` cần ADR và số liệu theo [`docs/03-architecture.md § 3.4`](./docs/03-architecture.md).

LiveKit client kết nối trực tiếp tới public LiveKit WSS/WebRTC/TURN bằng token scope hẹp do `core-api` mint. `signaling-gateway` không proxy SDP/ICE và không giữ LiveKit API secret; `core-api` là caller RoomService duy nhất. Self-host multi-node phân phối nhiều room qua Redis, nhưng một room vẫn nằm trên một node.

## Cấu trúc repo

```text
.
├── CLAUDE.md
├── README.md
├── docs/
│   ├── 00-overview-and-index.md
│   ├── 01-product-features.md
│   ├── 02-domain-model.md
│   ├── 03-architecture.md
│   ├── 04-tech-stack.md
│   ├── 05-coding-standards.md
│   ├── 06-domain-rules.md
│   ├── 07-roadmap.md
│   ├── 08-working-with-claude-code.md
│   ├── 09-practical-notes.md
│   ├── 10-code-review-checklist.md
│   ├── 11-nfr-and-production-readiness.md
│   ├── services/
│   │   ├── economy-service.md
│   │   └── matching-service.md
│   └── sources.md
├── apps/
│   ├── core-api/
│   ├── signaling-gateway/
│   └── media-server/       # LiveKit local/deployment config, không phải NestJS business app
└── libs/
```

Mobile/admin client chưa nằm trong repo này; trước khi build phải chốt stack/release/security scope bằng ADR. Vì vậy repo hiện tại chưa phải toàn bộ sản phẩm end-to-end.

## Bắt đầu

1. Đọc [`CLAUDE.md`](./CLAUDE.md) và [`docs/00-overview-and-index.md`](./docs/00-overview-and-index.md).
2. Đọc [`docs/03-architecture.md`](./docs/03-architecture.md) và [`docs/11-nfr-and-production-readiness.md`](./docs/11-nfr-and-production-readiness.md).
3. Chọn đúng task mở trong [`docs/07-roadmap.md`](./docs/07-roadmap.md); hiện tại ưu tiên R-004, R-005, R-006b, R-007, R-008 trước M2/M3 production.
4. Trước khi báo xong, review theo [`docs/10-code-review-checklist.md`](./docs/10-code-review-checklist.md) và gắn evidence đúng gate.

## Nguyên tắc cốt lõi

- Business module ở trong `core-api` cho tới khi ADR + metric chứng minh cần tách.
- `LedgerEntry` double-entry append-only là nguồn sự thật; Wallet chỉ là snapshot.
- Postgres là business source of truth của Matching; Redis queue là index dẫn xuất và phải rebuild được.
- `implemented` không đồng nghĩa `production-ready`; provider/media/safety/DR gate cần evidence riêng.
# litmatch
