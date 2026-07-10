<!-- File này Claude Code tự đọc ở đầu MỌI session làm việc trong repo, bất kể đang ở thư mục con nào. Giữ file này ngắn và ổn định — chi tiết đầy đủ nằm ở docs/, file này chỉ trỏ tới và nêu các luật không được vi phạm. Xem docs/00-overview-and-index.md để biết toàn cảnh bộ docs. -->

# Litmatch-style System — Hướng dẫn cho Claude Code

Hệ thống social-entertainment kiểu Litmatch: voice/text matching ẩn danh làm lõi, xoay quanh Economy diamond. Mục tiêu dài hạn là quy mô lớn, nhưng mọi scale/release claim phải có NFR + evidence theo `docs/11-nfr-and-production-readiness.md`. Xem @README.md để biết trạng thái repo.

## 3 luật không được vi phạm (dừng lại và hỏi lại nếu code đang đi ngược 1 trong 3 điều này)

1. **Boundary server**: baseline có 3 server workload family — `core-api`, `signaling-gateway`, LiveKit (`apps/media-server` là config). Mọi business domain khác là module NestJS trong `core-api` cho tới khi có ADR + metric theo `docs/03-architecture.md § 3.4`. Luật này không cấm mobile/web/admin client, infrastructure, migration job hay worker cùng codebase; worker phải ghi ownership/idempotency/scaling semantics.
2. **Economy/diamond**: `LedgerEntry` double-entry, append-only là nguồn sự thật; idempotency ở transaction nghiệp vụ, scope theo operation + actor (không đặt unique trên từng LedgerEntry). `Wallet.balance` chỉ là snapshot dẫn xuất. Không update/xoá ledger cũ — sửa bằng reversal mới. Chi tiết: `docs/03-architecture.md § 3.8.C`, `docs/services/economy-service.md`; production gap hiện tại ở roadmap R-004/R-005.
3. **Trước khi báo 1 task/module là "xong"**: tự chấm lại theo `docs/10-code-review-checklist.md`, bắt đầu từ § 10.0 (liệt kê luồng nghiệp vụ + giả định đang đặt ra về hành vi user, rồi xác nhận từng giả định có bị phá vỡ được không). Đây là bước bắt buộc, không phải tuỳ chọn — đặc biệt cho mọi thứ động tới Economy/Matching/Calling/Gift/Party Room.

## Bản đồ docs (đọc file tương ứng trước khi động vào phần đó, đừng đoán từ trí nhớ)

| Khi cần... | Đọc file |
|---|---|
| Toàn cảnh / mục lục đầy đủ | `docs/00-overview-and-index.md` |
| Danh sách tính năng | `docs/01-product-features.md` |
| Entity/domain model | `docs/02-domain-model.md` |
| Quyết định kiến trúc, service boundary, scale (SFU/matching-shard/ledger) | `docs/03-architecture.md` |
| Chọn công nghệ | `docs/04-tech-stack.md` |
| Coding convention, cấu trúc thư mục | `docs/05-coding-standards.md` |
| Domain rule cụ thể (free-call time, VIP, trust score...) | `docs/06-domain-rules.md` |
| Đang ở giai đoạn nào, làm gì tiếp | `docs/07-roadmap.md` |
| Quy trình giao việc/review theo giai đoạn | `docs/08-working-with-claude-code.md` |
| Lỗi hay gặp cần tránh khi triển khai | `docs/09-practical-notes.md` |
| **Tự review trước khi báo "xong"** | `docs/10-code-review-checklist.md` |
| NFR, capacity, security/data-safety và production gate | `docs/11-nfr-and-production-readiness.md` |
| Matching M1 state/durability/fairness | `docs/services/matching-service.md` |

## Quy trình làm việc mặc định

- Làm đúng **một task ID/slice có acceptance rõ** trong `docs/07-roadmap.md` mỗi lần. `[x] implemented` không được diễn giải thành production-ready; provider/load/safety/DR gate cần evidence riêng.
- Viết test song song với feature, không dồn cuối.
- Mọi API động tới diamond: idempotency key scope theo operation+actor, canonical request hash, DB constraint + transaction (`SELECT ... FOR UPDATE` hoặc optimistic lock). Không hardcode giá/threshold — đưa vào config/catalog và snapshot policy/price áp dụng.
- Nếu 1 quyết định cần thiết chưa có trong `docs/`, đề xuất phương án + lý do, hỏi lại thay vì tự ý quyết rồi im lặng — đặc biệt với bất cứ điều gì ảnh hưởng tới 3 luật ở trên.
- Khi phát hiện `docs/` sai hoặc thiếu 1 domain rule quan trọng trong lúc code thật: sửa trực tiếp vào file `docs/` tương ứng (không chỉ sửa trong hội thoại rồi để trôi mất), rồi tiếp tục.

## Lệnh build/test (Giai đoạn 0 đã xong — Nx + pnpm + Node 22)

```bash
pnpm install                            # cài dependency (pnpm 11, Node 22)
cp .env.example .env                    # config local (không commit .env)
docker compose up -d                    # Postgres + Redis + Kafka local
pnpm nx run core-api:migration-run      # migration TypeORM (cấm synchronize, kể cả dev)
pnpm nx serve core-api                  # dev server (PORT trong .env, mặc định 3000)
pnpm nx run-many -t lint                # lint tất cả (kèm @nx/enforce-module-boundaries)
pnpm nx run-many -t test                # unit test tất cả (kèm arch test module boundaries)
pnpm nx run-many -t build               # build tất cả → dist/apps/*

# Integration test tiền bạc trên Postgres thật — BẮT BUỘC pass trước khi merge code động tới Economy:
INTEGRATION_DB_URL=postgresql://litmatch:litmatch_local@localhost:5432/litmatch_test pnpm nx test core-api
```

- Swagger dev: `http://localhost:<PORT>/docs`. LiveKit local: `docker compose -f apps/media-server/docker-compose.yml up -d`.
- Test 1 project: `pnpm nx test core-api`. Docker image: `pnpm nx build core-api && docker build -f apps/core-api/Dockerfile .`

## Giới hạn của file này

File này là ngữ cảnh Claude đọc và cố gắng tuân theo, không phải cấu hình chặn cứng — nếu 1 hành vi bắt buộc phải chặn tuyệt đối (không chỉ "cố gắng tuân theo"), cần thêm hook riêng (xem tài liệu Claude Code về hooks), không chỉ dựa vào file này.
