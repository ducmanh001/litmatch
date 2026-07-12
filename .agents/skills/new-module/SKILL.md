---
name: new-module
description: Scaffold một module NestJS mới trong apps/core-api theo coding standards, boundary và reusable primitives của repo. Dùng khi bắt đầu bất kỳ module/domain mới hoặc khi cần chuẩn hoá lại skeleton module.
---

# Tạo module mới

## 1. Nạp context

1. Đọc `AGENTS.md`, `apps/core-api/AGENTS.md` và `docs/05-coding-standards.md § 5.3–5.6`.
2. Chạy `pnpm agent:context core` và scope domain nếu có.
3. Đọc domain rules/spec liên quan. Domain phức tạp chưa có spec thì tạo skeleton spec và xin
   quyết định trước khi code sâu.
4. Dùng `user/` làm mẫu đơn giản, `economy/` làm mẫu cho tiền/webhook.

## 2. Plan trước business logic

Nếu module có tiền, realtime, state machine hoặc tài nguyên tranh chấp, dùng skill
`review-module` mode `plan` trước khi viết service.

## 3. Tạo theo thứ tự

| #   | Thành phần                 | Quy tắc                                                                      |
| --- | -------------------------- | ---------------------------------------------------------------------------- |
| 1   | `entities/*.entity.ts`     | Dùng `BaseAppEntity` trừ PK nghiệp vụ/append-only; table snake_case số nhiều |
| 2   | `<module>.errors.ts`       | Một error taxonomy duy nhất, `as const`                                      |
| 3   | `dto/*.dto.ts`             | Validation + OpenAPI; output có `from`; list dùng cursor helper chung        |
| 4   | `<module>.constants.ts`    | Config key, constraint, topic, third-party constant, idempotency prefix      |
| 5   | `<module>.service.ts`      | Facade public; config typed; transaction/idempotency cho side effect         |
| 6   | Thành phần con             | Chỉ tạo folder thực sự cần: `services/jobs/ports/clients/webhooks/redis`     |
| 7   | `<module>.service.spec.ts` | Viết ngay; cover happy/error/edge/race nếu có contention                     |
| 8   | `<module>.controller.ts`   | Chỉ điều phối; DTO, OpenAPI, idempotency header đầy đủ                       |
| 9   | `events/`                  | Event versioned; DB write + publish dùng outbox                              |
| 10  | `<module>.module.ts`       | `forFeature`; export public API tối thiểu                                    |
| 11  | `index.ts`                 | Public API duy nhất của module                                               |
| 12  | Migration mới              | Không sửa migration đã commit; thêm index theo query thật                    |
| 13  | Đăng ký                    | Import module vào `app.module.ts`                                            |

Không tạo abstraction/folder để dành. Module khác không import file nội bộ.

## 4. Validate và bàn giao

```bash
pnpm agent:check
pnpm nx run core-api:lint
pnpm nx test core-api
pnpm nx build core-api
```

Sau đó dùng `review-module` mode `verify`. FAIL thì sửa và verify lại trước khi báo xong.
