[← 03 · Architecture](./03-architecture.md) · **04 · Tech Stack** · [05 · Coding Standards →](./05-coding-standards.md)

# 4. Tech Stack — ĐÃ CHỐT (2026-07-10)

> Các lựa chọn dạng "A hoặc B" trước đây đã được chốt để mọi session code (người hoặc agent) nhất quán, không mỗi lần tự quyết một kiểu. Muốn đổi 1 lựa chọn: sửa file này trước (kèm lý do), rồi mới code — không đổi ngầm trong code.

| Layer                     | Lựa chọn                                                              | Ghi chú                                                                                                                                                             |
| ------------------------- | --------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Monorepo                  | **Nx**                                                                | dùng `@nx/enforce-module-boundaries` (ESLint rule) làm "ArchUnit-style test" chặn import chéo trái phép mà [03-architecture.md § 3.2](./03-architecture.md) yêu cầu |
| Package manager / runtime | **pnpm + Node.js 22 LTS**                                             | pin version trong `package.json` `engines` + `.nvmrc`                                                                                                               |
| Backend framework         | NestJS (TypeScript)                                                   |                                                                                                                                                                     |
| ORM / migration           | **TypeORM**                                                           | migration file bắt buộc, có review với bảng tiền; **cấm `synchronize: true` ở mọi môi trường**; ledger path phức tạp được phép raw SQL trong repository             |
| DB chính                  | PostgreSQL                                                            | user, ledger/wallet, transaction, feed — cần ACID cho tiền                                                                                                          |
| Cache/Queue matching      | Redis                                                                 | matching queue, session cache, pub/sub, feed cache                                                                                                                  |
| Message broker            | **Kafka**                                                             | outbox relay + event fanout ở Litmatch-scale; RabbitMQ bị loại vì mục tiêu throughput/replay                                                                        |
| Realtime signaling        | **Socket.IO** (trên NestJS `@WebSocketGateway`)                       | + Redis adapter khi chạy nhiều instance (bắt buộc từ [07-roadmap.md § Giai đoạn 6](./07-roadmap.md))                                                                |
| Media/SFU                 | **LiveKit self-host**                                                 | đã chốt theo [03-architecture.md § 3.8.A](./03-architecture.md) — không bắt đầu bằng mediasoup                                                                      |
| Payment                   | Apple IAP + Google Play Billing SDK, hoặc Stripe nếu có web/nạp ngoài | chi tiết chốt ở Giai đoạn 1 khi tích hợp sandbox                                                                                                                    |
| API Gateway               | NestJS custom gateway hoặc Kong                                       | chưa chốt — quyết ở Giai đoạn 6/7 khi có nhu cầu thật, giai đoạn đầu core-api expose trực tiếp sau LB                                                               |
| Container/orchestration   | Docker + Kubernetes                                                   |                                                                                                                                                                     |
| Observability             | Prometheus + Grafana, OpenTelemetry tracing, ELK/Loki                 |                                                                                                                                                                     |
| CI/CD                     | GitHub Actions → build image → deploy K8s                             |                                                                                                                                                                     |

---

[← 03 · Architecture](./03-architecture.md) · [05 · Coding Standards →](./05-coding-standards.md)
