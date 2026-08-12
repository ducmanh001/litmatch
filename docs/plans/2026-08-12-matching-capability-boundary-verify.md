## Review — Matching capability boundary — verify — 2026-08-12

### 1. Phạm vi và luồng

Thay đổi này hoàn tất boundary cho Redis trong Matching, không đổi API contract, frontend,
schema hoặc state machine. `MatchingService`, matcher worker, sweeper và invite chỉ dùng các
capability port; Redis queue, rate-limit và realtime là adapter trong cùng `core-api`.

Luồng chính:

`Postgres ticket transaction → queue adapter enqueue → matcher queue adapter atomic pop →
Postgres SELECT FOR UPDATE + tạo MatchSession → realtime adapter best-effort → REST polling fallback`

`Session` vẫn là domain state do Matching sở hữu trong `core-api`; không tạo backend deployable
thứ tư. Hosting/observability được kiểm tra ở deployment profile và telemetry config, không đưa
vào business adapter.

### 2. Bảng giả định và vị trí chặn

| #   | Giả định / invariant                                                                  | Vector phá                                                               | Vị trí chặn (file:line)                                                                                                                          | Verdict |
| --- | ------------------------------------------------------------------------------------- | ------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------ | ------- |
| 1   | PostgreSQL là nguồn sự thật của ticket; Redis chỉ là queue dẫn xuất                   | Redis mất dữ liệu hoặc enqueue lỗi làm sai state DB                      | `apps/core-api/src/modules/matching/matching.service.ts:107`; `apps/core-api/src/modules/matching/jobs/matcher-worker.service.ts:233`            | ✅      |
| 2   | Hai matcher không lấy trùng ticket và ticket được verify lại đúng lúc ghép            | Worker cạnh tranh hoặc Redis chứa ticket stale                           | `apps/core-api/src/modules/matching/jobs/matcher-worker.service.ts:200`; `apps/core-api/src/modules/matching/jobs/matcher-worker.service.ts:236` | ✅      |
| 3   | Ticket DB commit trước, queue retry/recovery sau; không ghi ngược Redis thành sự thật | Redis timeout sau join tạo zombie ticket                                 | `apps/core-api/src/modules/matching/matching.service.ts:182`; `apps/core-api/src/modules/matching/jobs/ticket-sweeper.service.ts:221`            | ✅      |
| 4   | Một user chỉ có một ticket active                                                     | Hai request join đồng thời                                               | `apps/core-api/src/database/migrations/1752200000000-matching-core.ts:35`; `apps/core-api/src/modules/matching/matching.service.ts:172`          | ✅      |
| 5   | Rate-limit được consume trước debit; lỗi debit hoặc replay song song hoàn reservation | Double spend, mất quota oan hoặc retry bị 409                            | `apps/core-api/src/modules/matching/matching.service.ts:419`; `apps/core-api/src/modules/matching/matching.service.ts:447`                       | ✅      |
| 6   | Realtime là ephemeral; mất publish không làm mất kết quả DB                           | Redis pub/sub lỗi sau match                                              | `apps/core-api/src/modules/matching/jobs/matcher-worker.service.ts:370`; `apps/core-api/src/common/realtime/publish-realtime.ts:14`              | ✅      |
| 7   | Concrete Redis không xuyên vào business và shared client đóng đúng lifecycle          | Provider đổi transport hoặc shutdown đóng client quá sớm                 | `apps/core-api/src/modules/matching/redis/matching-redis.provider.ts:59`; `apps/core-api/src/modules/matching/matching.module.ts:81`             | ✅      |
| 8   | Session không bị tách thành app/service riêng trong thay đổi boundary này             | Vỡ invariant ba backend hoặc tạo distributed transaction không cần thiết | `apps/core-api/src/modules/matching/jobs/matcher-worker.service.ts:225`; `apps/core-api/src/modules/matching/matching.module.ts:70`              | ✅      |

### 3. Checklist áp dụng

| Mục                              | Kết quả | Ghi chú                                                                                                            |
| -------------------------------- | ------- | ------------------------------------------------------------------------------------------------------------------ |
| Boundary/domain ownership        | ✅      | Domain chỉ phụ thuộc capability port; adapter/provider giữ ioredis.                                                |
| Concurrency/state machine        | ✅      | `ZPOPMIN` atomic, DB lock cố định, transition và session creation trong transaction.                               |
| Economy                          | ✅      | Speed-up vẫn đi qua `EconomyService`; rate-limit chặn trước debit và refund reservation khi debit/replay thất bại. |
| Realtime failure mode            | ✅      | Publish sau commit, lỗi vẫn giữ REST polling fallback.                                                             |
| API/frontend/migration contract  | ✅      | Không đổi controller/DTO/frontend và không thêm migration.                                                         |
| Hosting/observability/deployment | ✅      | Local production smoke truyền S3-compatible profile explicit; telemetry không bị hard-code vào domain.             |

### 4. Test evidence

| Check                                     | Kết quả                                                                               |
| ----------------------------------------- | ------------------------------------------------------------------------------------- |
| `NX_TUI=false pnpm agent:verify matching` | ✅ PASS — OpenAPI, format, lint, 96 suites/953 tests, build                           |
| `NX_TUI=false pnpm agent:verify core`     | ✅ PASS — 96 suites/953 tests, build, migration-run, core E2E 4 suites/12 tests       |
| `node --test scripts/ci/local.test.mjs`   | ✅ PASS — 16 tests                                                                    |
| `NX_TUI=false pnpm ci:local:docker`       | ✅ PASS — build 12 projects, migrations, core/signaling/web health smoke, Edge config |
| `pnpm agent:test`                         | ✅ PASS — 122/122                                                                     |
| `git diff --check` và Prettier            | ✅ PASS                                                                               |

### 5. Kết luận

`review-module verify`: PASS. Các invariant đã có vị trí chặn cụ thể và được kiểm tra bằng test
unit/integration/E2E cùng runtime Docker smoke. Không có lỗi nào bị che bằng skip hoặc nới
assertion; lỗi production boot ban đầu đã được sửa ở local deployment profile bằng S3 adapter
explicit.
