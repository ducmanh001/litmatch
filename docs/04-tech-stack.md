[← 03 · Architecture](./03-architecture.md) · **04 · Tech Stack** · [05 · Coding Standards →](./05-coding-standards.md)

# 4. Tech Stack đề xuất

| Layer | Lựa chọn |
|---|---|
| Backend framework | NestJS (TypeScript) |
| DB chính | PostgreSQL (user, wallet, transaction, feed — cần ACID cho wallet) |
| Cache/Queue matching | Redis (matching queue, session cache, pub/sub, feed cache) |
| Message broker | Kafka hoặc RabbitMQ |
| Realtime signaling | WebSocket (NestJS `@WebSocketGateway`) hoặc Socket.IO |
| Media/SFU | mediasoup (self-host, free, cần tự lắp phần distributed) hoặc LiveKit (đóng gói sẵn cascading mesh, dễ scale hơn) — **chọn theo mục tiêu quy mô, xem [03-architecture.md § 3.8.A](./03-architecture.md)** |
| Payment | Apple IAP + Google Play Billing SDK, hoặc Stripe nếu có web/nạp ngoài |
| API Gateway | NestJS custom gateway hoặc Kong |
| Container/orchestration | Docker + Kubernetes |
| Observability | Prometheus + Grafana, OpenTelemetry tracing, ELK/Loki |
| CI/CD | GitHub Actions → build image → deploy K8s |

---
[← 03 · Architecture](./03-architecture.md) · [05 · Coding Standards →](./05-coding-standards.md)
