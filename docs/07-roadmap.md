[← 06 · Domain Rules](./06-domain-rules.md) · **07 · Roadmap** · [08 · Working with Claude Code →](./08-working-with-claude-code.md)

# 7. Checklist triển khai theo giai đoạn

> **Ghi chú thuật ngữ**: trong toàn bộ file này, tên gọi "... Service" (Auth Service, Matching Service, Economy Service...) nghĩa là **module NestJS bên trong `apps/core-api`** (đúng cấu trúc [03-architecture.md § 3.2](./03-architecture.md) và [05-coding-standards.md § 5.3](./05-coding-standards.md)), KHÔNG phải service deploy riêng — chỉ `core-api`, Signaling Gateway, Media Server mới là 3 thành phần deploy độc lập xuyên suốt dự án (trừ khi 1 module đã đủ tiêu chí tách ở [03-architecture.md § 3.4](./03-architecture.md), ghi rõ ở Giai đoạn 7 bên dưới).
>
> **Trạng thái hiện tại của dự án**: xem đầu file này hoặc hỏi lại nếu không rõ đang ở giai đoạn nào — file này không tự động cập nhật trạng thái, người dùng/agent cần tick `[x]` thủ công khi hoàn thành và commit lại.

## Giai đoạn 0 — Nền móng
- [ ] Setup monorepo (Nx/Turborepo) gồm 3 app theo đúng § 3.2 (`core-api`, `signaling-gateway`, `media-server`) + các thư viện dùng chung — không tạo thêm app NestJS riêng cho từng domain (Auth/User/Matching...), các domain này là module trong `core-api`
- [ ] `docker-compose` local: Postgres, Redis, Kafka/RabbitMQ
- [ ] Auth module (JWT + refresh token)
- [ ] User module (CRUD profile cơ bản + avatar mặc định)
- [ ] CI pipeline: lint, test, build, docker image
- [ ] Shared libs: `common-exceptions`, `common-dtos`, `logger`, `config-validator`

## Giai đoạn 1 — Economy trước (vì mọi feature khác phụ thuộc vào nó)
> Vì mục tiêu là quy mô Litmatch thật (không phải MVP), xây **double-entry ledger đầy đủ ngay từ Giai đoạn 1** theo đúng [03-architecture.md § 3.8.C](./03-architecture.md) — không làm bản đơn giản (1 cột `balance`) rồi tính chuyển đổi sau, vì đổi mô hình dữ liệu tiền bạc giữa chừng khi đã có giao dịch thật là việc rất tốn kém và rủi ro.
- [ ] Economy module: `LedgerEntry` (double-entry, append-only, idempotency key unique ở DB) làm nguồn sự thật; `Wallet` chỉ là snapshot/cache dẫn xuất — đúng [02-domain-model.md](./02-domain-model.md)
- [ ] Tích hợp Apple IAP + Google Play Billing (sandbox trước), có job đối soát (reconciliation) so khớp ledger nội bộ với dữ liệu IAP ngay từ đầu, không đợi tới Giai đoạn 7
- [ ] VIP membership: mua, gia hạn, hết hạn tự downgrade

## Giai đoạn 2 — Matching lõi (Soul Match + Voice Match)
> Xây Matching module theo đúng hình dạng full-scale ở [03-architecture.md § 3.8.B](./03-architecture.md) ngay từ đầu (ticket state machine + shard theo tiêu chí), thay vì làm 1 queue Redis đơn giản rồi tái cấu trúc sau.
- [ ] Matching module: `MatchTicket` với state machine `queued → matched → confirmed → expired/cancelled`, queue shard theo (loại match × region × dải tiêu chí lọc cơ bản: tuổi/giới tính), priority speed-up (trừ diamond qua Economy module qua DI, không qua network)
- [ ] Soul Match: chat room ẩn danh tạm thời, cơ chế like/dislike 2 chiều, unlock profile khi match
- [ ] Signaling Gateway (WebSocket) cho Voice Match
- [ ] Tích hợp SFU (mediasoup hoặc LiveKit — chọn theo § 3.8.A dựa trên mục tiêu scale, quyết định sớm vì đổi giữa chừng tốn kém) cho phòng 2 người
- [ ] Calling module: tạo/kết thúc call, tính thời lượng, trừ diamond theo phút nếu có

## Giai đoạn 3 — Party Room + Gift
- [ ] Party Room module: tạo phòng, quản lý role host/speaker/audience, **giới hạn cứng số speaker/phòng theo config** (Party Room chạm ngưỡng tải SFU sớm hơn Voice Match rất nhiều vì consumer tăng theo N×(N-1) — xem § 3.8.A)
- [ ] Mở rộng SFU cho multi-party
- [ ] Gift module: catalog quà, tặng quà realtime, trừ/cộng diamond trong cùng 1 transaction/saga (xem lỗi thường gặp ở [10-code-review-checklist.md § Gift Service](./10-code-review-checklist.md))

## Giai đoạn 4 — Social layer
- [ ] Feed module: post, like, comment
- [ ] Avatar module: catalog item, ghép avatar
- [ ] Report/Block, trust score ảnh hưởng matching

## Giai đoạn 5 — Content phụ trợ
- [ ] Movie Match: đồng bộ playback qua WebSocket
- [ ] Palm Match: template content, random theo input

## Giai đoạn 6 — Scale & Observability
- [ ] Horizontal scale Signaling Gateway (Redis adapter cho Socket.IO)
- [ ] Kubernetes deployment + autoscale
- [ ] Monitoring: Prometheus metrics (matching latency, call drop rate, transaction failure rate)
- [ ] Distributed tracing xuyên suốt Matching → Calling → Economy
- [ ] Load test (k6/Artillery)

## Giai đoạn 7 — Vận hành ở quy mô thật (Litmatch-scale, không còn là MVP)
> Vì ledger double-entry (Giai đoạn 1) và ticket/shard cho Matching (Giai đoạn 2) đã được **thiết kế đúng ngay từ đầu**, Giai đoạn 7 không phải là sửa lại thiết kế — mà là **vận hành/mở rộng thực sự** những gì đã thiết kế sẵn, khi số liệu traffic thật xác nhận cần (đúng tinh thần MonolithFirst ở § 3.1: quyết định *thiết kế* chọn sớm, quyết định *khi nào bung ra hạ tầng thật* thì chờ số liệu).
- [ ] Bật cascade SFU thật (LiveKit mesh nhiều node, hoặc `pipeToRouter` nhiều host của mediasoup) khi số liệu xác nhận Party Room chạm ngưỡng vài nghìn consumer/node — xem § 3.8.A
- [ ] Bung thêm shard/matcher worker instance cho Matching Queue theo region mới hoặc tiêu chí mới khi traffic khu vực đó đủ lớn — xem § 3.8.B
- [ ] Mở rộng job đối soát (reconciliation) ledger chạy tần suất cao hơn + cảnh báo tự động khi phát hiện lệch Nợ/Có — xem § 3.8.C
- [ ] Tách các module đã đủ tiêu chí ở § 3.4 ra khỏi `core-api` thành service riêng (đo bằng số liệu thật: CPU/DB load, không đoán)
- [ ] Multi-region deployment cho Signaling Gateway + Media Server, routing user tới region gần nhất (giảm latency thoại)
- [ ] CQRS/read-replica cho Feed khi lượng đọc vượt xa lượng ghi (fanout-on-write hoặc fanout-on-read tuỳ tỉ lệ follower trung bình)
- [ ] Chaos testing cho luồng tiền (kill Economy giữa transaction, kill matcher giữa lúc ghép cặp) để xác nhận idempotency/outbox hoạt động đúng dưới lỗi thật, không chỉ đúng trên giấy

---
[← 06 · Domain Rules](./06-domain-rules.md) · [08 · Working with Claude Code →](./08-working-with-claude-code.md)
