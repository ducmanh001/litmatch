---
name: new-module
description: Scaffold một module NestJS mới trong apps/core-api theo coding standards, boundary và reusable primitives của repo. Dùng khi bắt đầu bất kỳ module/domain mới hoặc khi cần chuẩn hoá lại skeleton module.
---

# Tạo module mới

## 1. Nạp context

1. Đọc `AGENTS.md`, `apps/core-api/AGENTS.md`, `docs/05-coding-standards.md § 5.1–5.6`
   và [Module Blueprint](../../../docs/16-module-blueprint.md). Blueprint là nguồn chuẩn
   cho cây file/folder; skill này chỉ mô tả thứ tự thao tác.
2. Chạy `pnpm agent:context core` và scope domain nếu có.
3. Đọc domain rules/spec liên quan. Domain phức tạp chưa có spec thì tạo skeleton spec và xin
   quyết định trước khi code sâu.
4. Dùng `user/` làm mẫu đơn giản, `economy/` làm mẫu cho tiền/webhook.

## 2. Plan trước business logic

Nếu module có tiền, realtime, state machine hoặc tài nguyên tranh chấp, dùng skill
`review-module` mode `plan` trước khi viết service.

## 3. Tạo theo thứ tự

1. Xác định ownership, boundary, flow và acceptance criteria. Nếu module có tiền,
   realtime, state machine hoặc contention, chạy `review-module plan`.
2. Tạo root skeleton theo blueprint: `<module>.module.ts`, facade service nếu có
   behavior, controller nếu có HTTP, `<module>.errors.ts` và `index.ts`.
3. Thêm `constants.ts` và các folder optional (`dto`, `entities`, `services`,
   `repositories`, `ports`, `clients`, `jobs`, `webhooks`, `redis`, `events`) chỉ khi
   thực sự có thành phần tương ứng.
4. Thêm entity/DTO/port/service/job/client/event theo nhu cầu; dùng `BaseAppEntity`,
   shared decorators, cursor helper và `DomainException` của repo khi áp dụng.
5. Viết unit test cạnh file nguồn. Thêm integration test DB thật cho flow cần kiểm tra
   transaction/concurrency. Schema chỉ đổi bằng migration mới.
6. Wiring `forFeature`, provider và public exports tối thiểu trong `<module>.module.ts`;
   đăng ký module trong `app.module.ts`.
7. Kiểm tra `index.ts` không làm lộ entity/repository/job/client nội bộ và module khác
   không import file nội bộ.

Không tạo abstraction hoặc folder để dành. Module khác không import file nội bộ.

## 4. Validate và bàn giao

```bash
pnpm agent:check
pnpm nx run core-api:lint
pnpm nx test core-api
pnpm nx build core-api
```

Sau đó dùng `review-module` mode `verify`. FAIL thì sửa và verify lại trước khi báo xong.
