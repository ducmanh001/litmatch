<!-- File này Claude Code tự đọc ở đầu MỌI session làm việc trong repo, bất kể đang ở thư mục con nào. Giữ file này ngắn và ổn định — chi tiết đầy đủ nằm ở docs/, file này chỉ trỏ tới và nêu các luật không được vi phạm. Xem docs/00-overview-and-index.md để biết toàn cảnh bộ docs. -->

# Litmatch-style System — Hướng dẫn cho Claude Code

Hệ thống social-entertainment kiểu Litmatch: voice/text matching ẩn danh làm lõi, xoay quanh 1 hệ kinh tế diamond (Economy) để monetize. Mục tiêu là quy mô Litmatch thật (hàng trăm nghìn – hàng triệu người dùng đồng thời), **không phải MVP**. Xem @README.md để biết tổng quan repo.

## 3 luật không được vi phạm (dừng lại và hỏi lại nếu code đang đi ngược 1 trong 3 điều này)

1. **Chỉ 3 thành phần deploy riêng biệt**: `apps/core-api`, `apps/signaling-gateway`, `apps/media-server`. Mọi domain khác (auth, user, matching, economy, social, content, moderation, notification, gift, party-room, feed, avatar...) là **module NestJS bên trong `apps/core-api`**, KHÔNG phải app/service riêng. Không tự ý tạo app thứ 4. Chi tiết + lý do: `docs/03-architecture.md`.
2. **Economy/diamond**: `LedgerEntry` (double-entry, append-only) là nguồn sự thật duy nhất; idempotency key là unique constraint ở tầng DB trên bảng `Transaction` (1 key/giao dịch — KHÔNG đặt unique trên `LedgerEntry` vì 1 giao dịch có ≥2 bút toán). `Wallet.balance` chỉ là snapshot dẫn xuất, không bao giờ được coi là nguồn sự thật. Không update/xoá dòng ledger cũ — sửa sai bằng bút toán đảo (reversal entry) mới. Chi tiết: `docs/03-architecture.md § 3.8.C`, `docs/02-domain-model.md`.
3. **Trước khi báo 1 task/module là "xong"**: tự chấm lại theo `docs/10-code-review-checklist.md` bằng skill **`/review-module`** (`plan` trước khi code, `verify` trước khi báo xong — output template cố định, verify FAIL thì chưa được báo xong). Đây là bước bắt buộc, không phải tuỳ chọn — đặc biệt cho mọi thứ động tới Economy/Matching/Calling/Gift/Party Room.

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

## Quy trình làm việc mặc định

- Làm **đúng 1 giai đoạn** trong `docs/07-roadmap.md` mỗi lần, tick `[x]` khi xong, dừng lại để review trước khi sang giai đoạn tiếp theo — không tự ý nhảy cóc.
- Viết test song song với feature, không dồn cuối.
- Mọi API động tới diamond: idempotency key bắt buộc + transaction DB (`SELECT ... FOR UPDATE` hoặc optimistic lock). Không hardcode giá/threshold — đưa vào `.env` + `ConfigModule`.
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

## Giới hạn của file này & guardrail cứng

File này là ngữ cảnh Claude đọc và cố gắng tuân theo, không phải cấu hình chặn cứng. Các luật phải chặn tuyệt đối đã có **hook** tại `.claude/hooks/pre-tool-guard.mjs` (đăng ký trong `.claude/settings.json`), chặn: tạo app thứ 4 trong `apps/`, `synchronize: true`, sửa/xoá migration đã commit, UPDATE/DELETE `ledger_entries`. Bị hook chặn nghĩa là đang vi phạm 1 trong các luật trên — sửa cách làm hoặc hỏi user, không tìm cách lách. Muốn thêm luật chặn cứng mới: sửa hook đó, không chỉ thêm chữ vào file này.
