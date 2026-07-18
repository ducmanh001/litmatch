## Review — core scheduled jobs — plan — 2026-07-18

### 1. Phạm vi & luồng nghiệp vụ

`ConfigService lấy interval → SchedulerRegistry đăng ký timer → tick gọi public runOnce/flushOnce → bỏ qua nếu tick cũ còn chạy → domain tự giữ transaction/idempotency/lock → lỗi được log → shutdown xoá timer`

Refactor chỉ gom lifecycle timer và chốt chống chạy chồng vào primitive trung lập trong
`core-api/common`; không đổi SQL, state transition, transaction, idempotency key, thứ tự side
effect hay tần suất của bất kỳ domain nào.

### 2. Bảng giả định

| #   | Giả định                                                                | Ai phá / cách phá                                       | Chặn ở đâu                                                                                       | Verdict |
| --- | ----------------------------------------------------------------------- | ------------------------------------------------------- | ------------------------------------------------------------------------------------------------ | ------- |
| 1   | Mỗi job vẫn đọc đúng interval từ env hiện hành                          | Refactor hardcode/thay nhầm env key                     | Mỗi `onApplicationBootstrap` tiếp tục gọi đúng `ConfigService.getOrThrow`; test/build từng scope | ✅      |
| 2   | Hai tick của cùng một instance không chạy chồng                         | Timer chạy lại trước khi promise cũ hoàn tất            | `ManagedInterval.runExclusive`, có `finally` nhả cờ kể cả task throw                             | ✅      |
| 3   | Lỗi một tick không tạo unhandled rejection và timer sau vẫn chạy        | Callback timer bỏ quên catch hoặc runner kẹt cờ         | `ManagedInterval.start` catch + logger; unit test reject/retry                                   | ✅      |
| 4   | Shutdown chỉ xoá đúng timer thuộc job                                   | Trùng/sai tên job hoặc delete mù                        | Tên job canonical giữ nguyên; `doesExist` trước `deleteInterval`                                 | ✅      |
| 5   | Correctness xuyên pod không dựa vào cờ in-memory                        | Người sửa tưởng `runExclusive` thay DB lock/idempotency | SQL/transaction/domain code không đổi; comment primitive nói rõ phạm vi per-process              | ✅      |
| 6   | Party Room giữ hai timer và hai khóa overlap độc lập                    | Dùng chung một runner khiến host-grace chặn sweeper     | Hai instance `ManagedInterval`, giữ nguyên hai job name/env key                                  | ✅      |
| 7   | Economy outbox chỉ đăng ký timer khi enabled và vẫn disconnect producer | Gom lifecycle làm mất nhánh feature flag/shutdown async | Nhánh enabled và producer lifecycle ở `OutboxRelayService` không đổi                             | ✅      |

### 3. Checklist áp dụng

| Mục                       | Kết quả | Ghi chú                                                                       |
| ------------------------- | ------- | ----------------------------------------------------------------------------- |
| Boundary/domain ownership | ✅      | Primitive chỉ quản timer/overlap/log; domain giữ toàn bộ nghiệp vụ và dữ liệu |
| Config single source      | ✅      | Không đổi env key hoặc default                                                |
| Concurrency/atomicity     | ✅      | Cờ chỉ chống overlap trong process; DB lock/idempotency hiện hành giữ nguyên  |
| Failure isolation         | ✅      | Catch tại timer boundary, nhả running trong `finally`                         |
| Observability             | ✅      | Giữ logger và thông báo lỗi riêng từng job                                    |
| Economy invariants        | N/A     | Không sửa ledger/wallet/transaction; outbox query và transaction giữ nguyên   |
| API/schema/migration      | N/A     | Không đổi public API hay schema                                               |

### 4. Test đã chạy

Mode plan: sẽ chạy unit test primitive, unit/integration hiện có của các job bị ảnh hưởng,
`pnpm agent:verify core`, file-level circular dependency scan và `review-module verify`.

### 5. Kết luận: PASS

Có thể triển khai refactor cơ học theo plan; nếu buộc phải đổi domain behavior thì dừng và lập
review riêng cho domain đó.
