# Litmatch — hợp đồng làm việc cho mọi agent

Đây là nguồn hướng dẫn bắt buộc và trung lập cho mọi agent làm việc trong repo. Các file
tương thích theo từng công cụ chỉ được trỏ về đây, không được chứa luật riêng. Đọc
`docs/00-overview-and-index.md` để lấy bản đồ tài liệu đầy đủ.

## Ba luật không được vi phạm

1. **Chỉ ba thành phần deploy riêng**: `apps/core-api`, `apps/signaling-gateway`,
   `apps/media-server`. Mọi domain khác là module NestJS bên trong `core-api`; không tự tạo
   app/service thứ tư. Xem `docs/03-architecture.md`.
2. **Economy/diamond**: `LedgerEntry` double-entry, append-only là nguồn sự thật;
   `Wallet.balance` chỉ là snapshot. Idempotency key unique ở DB trên `Transaction`. Không
   sửa/xoá ledger cũ; sửa sai bằng reversal entry mới. Xem `docs/03-architecture.md § 3.8.C`.
3. **Trước khi báo xong**: dùng skill `review-module` ở mode `verify`; thay đổi nhạy cảm phải
   có bảng giả định, vị trí chặn và bằng chứng test thật. Mode `verify` FAIL nghĩa là task chưa
   hoàn tất.

## Nạp đúng context

Chạy `pnpm agent:context <scope>` trước khi sửa. Scope hỗ trợ: `core`, `economy`, `matching`,
`signaling`, `media`, `infra`. Nếu chưa rõ scope, chạy `pnpm agent:context`.

| Khi cần                  | Đọc                                 |
| ------------------------ | ----------------------------------- |
| Toàn cảnh                | `docs/00-overview-and-index.md`     |
| Domain model             | `docs/02-domain-model.md`           |
| Kiến trúc/boundary/scale | `docs/03-architecture.md`           |
| Tech stack               | `docs/04-tech-stack.md`             |
| Coding convention        | `docs/05-coding-standards.md`       |
| Domain rules             | `docs/06-domain-rules.md`           |
| Roadmap hiện tại         | `docs/07-roadmap.md`                |
| Quy trình agent          | `docs/08-working-with-agents.md`    |
| Review bắt buộc          | `docs/10-code-review-checklist.md`  |
| La bàn thiết kế          | `docs/11-engineering-principles.md` |

## Quy trình mặc định

1. Xác nhận objective, out-of-scope và acceptance criteria từ task; không tự mở rộng phạm vi.
2. Nạp context đúng scope, đọc `AGENTS.md` gần nhất trong cây thư mục nếu có.
3. Với module/luồng nghiệp vụ mới, dùng `review-module plan` trước khi code.
4. Viết test song song với thay đổi. Schema chỉ đổi bằng migration mới.
5. Chạy `pnpm agent:check`, test áp dụng, lint và build.
6. Chạy `review-module verify`; bàn giao file thay đổi, lệnh đã chạy, kết quả và quyết định còn mở.
7. Nếu phát hiện docs sai/thiếu, sửa nguồn docs tương ứng trong cùng thay đổi.

## Boundary và correctness

- Domain sở hữu logic, dữ liệu, type và quyền ghi; module khác đi qua public API/DTO/event.
- `common/` phải trung lập; dependency một chiều; không tạo abstraction để dành.
- Side effect phải idempotent và atomic; correctness trước cache/performance.
- API chạm diamond cần idempotency key + DB transaction/locking phù hợp.
- Security, privacy, compatibility, failure isolation và observability là phần của thiết kế.
- Không hardcode giá/threshold; dùng config có validation và cập nhật `.env.example`.

## Skills dùng chung

- Tạo module: đọc và làm theo `.agents/skills/new-module/SKILL.md`.
- Plan/review module: đọc và làm theo `.agents/skills/review-module/SKILL.md`.

Skill là quy trình dùng chung, không phụ thuộc model, IDE hay nhà cung cấp.

## Lệnh kiểm chứng

```bash
pnpm doctor
pnpm agent:context <scope>
pnpm agent:check
pnpm agent:test
pnpm format:check
pnpm lint
pnpm test
pnpm build
```

Thay đổi Economy phải chạy thêm integration test thật, không dùng cache:

```bash
INTEGRATION_DB_URL=postgresql://litmatch:litmatch_local@localhost:5432/litmatch_test \
  pnpm nx test core-api --skip-nx-cache
```

## Guardrail

Rule engine trung lập nằm tại `scripts/agent/guard-core.mjs`; adapter tương tác và CI cùng gọi
chung engine này. Bị guard chặn thì sửa cách làm hoặc xin quyết định mới, không tìm cách lách.
