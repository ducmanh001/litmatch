[← 03 · Architecture](./03-architecture.md) · **04 · Tech Stack** · [05 · Coding Standards →](./05-coding-standards.md)

# 4. Tech Stack — baseline đã chốt, decision mở phải ghi rõ

> Các lựa chọn baseline bên dưới đã chốt cho server hiện tại. Dòng có trạng thái “chưa chốt” là decision gate, không được implementation tự chọn im lặng. Muốn đổi lựa chọn đã chốt: tạo/sửa ADR + docs trước khi code.

| Layer | Lựa chọn | Ghi chú |
|---|---|---|
| Monorepo | **Nx** | dùng `@nx/enforce-module-boundaries` (ESLint rule) làm "ArchUnit-style test" chặn import chéo trái phép mà [03-architecture.md § 3.2](./03-architecture.md) yêu cầu |
| Package manager / runtime | **pnpm + Node.js 22 LTS** | pin version trong `package.json` `engines` + `.nvmrc` |
| Backend framework | NestJS (TypeScript) | |
| ORM / migration | **TypeORM** | migration file bắt buộc, có review với bảng tiền; **cấm `synchronize: true` ở mọi môi trường**; ledger path phức tạp được phép raw SQL trong repository |
| DB chính | PostgreSQL | user, ledger/wallet, transaction, feed — cần ACID cho tiền |
| Cache/Queue matching | Redis | matching queue, session cache, pub/sub, feed cache |
| Message broker | **Kafka** | outbox relay + event fanout ở Litmatch-scale; RabbitMQ bị loại vì mục tiêu throughput/replay |
| Application realtime | **Socket.IO** (NestJS `@WebSocketGateway`) | presence/chat/session/control intent; **không proxy SDP/ICE LiveKit**; Redis adapter khi nhiều instance |
| Media/SFU | **LiveKit self-host** | client kết nối trực tiếp bằng LiveKit SDK/token scope hẹp; multi-node scale số room qua Redis, **một room/node** — [03 § 3.5](./03-architecture.md) |
| Client apps | **Chưa chốt trong repo backend hiện tại** | mobile/admin không bị cấm bởi luật 3 server workload; phải có ADR về native/cross-platform, release/store, push/offline/accessibility trước khi build |
| Payment | **Apple IAP + Google Play Billing** cho digital goods mobile | production gate R-004: Apple signed transaction/App Store Server API, Google acknowledge/consume/PENDING; Stripe/web chỉ sau policy + ADR riêng |
| API Gateway | NestJS custom gateway hoặc Kong | chưa chốt — quyết ở Giai đoạn 6/7 khi có nhu cầu thật, giai đoạn đầu core-api expose trực tiếp sau LB |
| Container/orchestration | Docker + Kubernetes | image/Helm version pin; LiveKit không dùng tag `latest` ở production |
| Observability | Prometheus + Grafana, OpenTelemetry tracing, ELK/Loki | |
| CI/CD | GitHub Actions → build image → deploy K8s | |

Ba workload server ban đầu (`core-api`, `signaling-gateway`, LiveKit) là topology baseline, không phải lệnh cấm client/admin/worker. Capacity và điều kiện production nằm ở [11-nfr-and-production-readiness.md](./11-nfr-and-production-readiness.md).

---
[← 03 · Architecture](./03-architecture.md) · [05 · Coding Standards →](./05-coding-standards.md)
