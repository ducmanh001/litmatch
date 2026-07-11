---
name: new-module
description: Scaffold 1 module NestJS mới trong apps/core-api theo đúng khung docs/05 § 5.3 — thứ tự sinh file cố định, dùng các abstract/helper dùng chung (BaseAppEntity, DomainException, IdempotencyKey, cursor pagination). Dùng khi bắt đầu bất kỳ module/domain mới (matching, gift, social, feed, party-room...).
argument-hint: "<tên-module> [mô tả ngắn nghiệp vụ]"
---

# /new-module — sinh module mới đúng khung, đúng thứ tự

Mục tiêu: mọi module sinh ra **giống hệt nhau về khung**, chỉ khác business logic. Khung là cố định; nghiệp vụ bên trong service thì tự do — KHÔNG bịa thêm tầng abstract cho business logic.

## Bước 0 — Đọc trước khi sinh (bắt buộc, không đoán từ trí nhớ)

1. `docs/05-coding-standards.md` § 5.3–5.6 (khung thư mục, API contract, error taxonomy, naming).
2. Mục domain rule liên quan trong `docs/06-domain-rules.md` + spec `docs/services/<module>-service.md` nếu có. Nếu module đủ phức tạp (động tới tiền/realtime/state machine) mà chưa có spec: viết skeleton spec trước theo cấu trúc `docs/services/economy-service.md`, hỏi user chốt rồi mới code.
3. Xem 1 module mẫu làm chuẩn hình thái: `apps/core-api/src/modules/user/` (đơn giản) hoặc `economy/` (có tiền + webhook + services phụ).

## Bước 1 — Sinh file theo ĐÚNG thứ tự này (mỗi file một lần, không quay lại sửa kiểu lung tung)

Thư mục: `apps/core-api/src/modules/<module>/`

| # | File | Quy tắc bắt buộc |
|---|---|---|
| 1 | `entities/*.entity.ts` | `extends BaseAppEntity` (`src/common/entities/base.entity.ts`) trừ khi có PK nghiệp vụ riêng hoặc bảng append-only — khi đó tự khai cột và ghi comment vì sao. Bảng snake_case số nhiều. Enum khai cùng file entity. |
| 2 | `<module>.errors.ts` | `export const <Module>Errors = {...} as const` — TOÀN BỘ mã lỗi của module ở đây, format `DOMAIN_SUBJECT_REASON`. Không sinh mã lỗi rải rác trong service. |
| 3 | `dto/*.dto.ts` | class-validator đầy đủ; DTO output có static `from(entity)` (xem `user-profile.dto.ts`); list dùng `CursorPageQueryDto` từ `@litmatch/common-dtos`. Không trả entity trần. |
| 4 | `<module>.service.ts` | Business logic ở đây. Lỗi = `throw new DomainException(<Module>Errors.X, msg, 4xx)`. Config qua `ConfigService`, cấm `process.env` trực tiếp. Thao tác không được lặp → transaction DB + prefix idempotency key theo domain. List → query `limit + 1` rồi `buildCursorPage()`. |
| 5 | `<module>.service.spec.ts` | Viết NGAY sau service, không dồn cuối. Cover: happy path, mỗi mã lỗi trong `*.errors.ts` ít nhất 1 case, edge case (rỗng/0/trùng). Race-condition test nếu động tới tiền/tài nguyên tranh chấp. |
| 6 | `<module>.controller.ts` | Chỉ điều phối, không tính toán. Decorator OpenAPI viết ngay (`@ApiTags`, `@ApiOperation`, `@ApiOkResponse`). Endpoint có tác dụng phụ không được lặp → `@IdempotencyKey()` + `@ApiIdempotencyKeyHeader()` (`src/common/decorators/idempotency-key.decorator.ts`). Route `api/v1` đã set global — không tự prefix lại. |
| 7 | `events/` (nếu có) | Tên event `<domain>.<subject>.<động-từ-quá-khứ>`, có field `version`. Publish qua Outbox nếu đi kèm ghi DB (docs/03 § 3.6). |
| 8 | `<module>.module.ts` | `TypeOrmModule.forFeature([...])`, `exports:` chỉ những service là public API. |
| 9 | `index.ts` | Public API duy nhất của module — module khác CHỈ import từ đây (arch test enforce). Export ít nhất có thể. |
| 10 | Migration | `apps/core-api/src/database/migrations/<timestamp>-<module>-init.ts` — MỚI, không sửa migration cũ (hook chặn). Index cho cột hay filter/sort. |
| 11 | Đăng ký | Thêm module vào `apps/core-api/src/app/app.module.ts`. |

## Bước 2 — Xác nhận khung đúng

```bash
pnpm nx run-many -t lint          # kèm arch test module boundaries
pnpm nx test core-api
```

## Bước 3 — Bàn giao

- Nghiệp vụ phức tạp/nhiều bước: chạy `/review-module plan <module>` TRƯỚC khi viết service (bước 4) — liệt kê giả định trước khi code rẻ hơn sửa sau.
- Xong module: `/review-module verify <module>` trước khi báo "xong" (luật 3 CLAUDE.md).
- Nếu trong lúc scaffold phát hiện khung dùng chung còn thiếu 1 mảnh lặp lại ≥2 module (guard, interceptor, helper): thêm vào `src/common/` hoặc `libs/`, KHÔNG copy-paste giữa các module.
