# Review — system-role-testing — verify — 2026-07-18

## 1. Phạm vi và flow thực tế

- Web user: đăng nhập bằng OTP → backend cấp access token và refresh cookie → tải lại trình
  duyệt để khôi phục session → vào hàng đợi ghép đôi → polling trạng thái bằng phiên đã khôi
  phục.
- Admin staff: đăng nhập → frontend chỉ cho `moderator`/`admin` vào shell quản trị → backend
  kiểm tra role ở class-level → đọc permission hiện hành từ DB cho từng handler → thực thi và
  ghi audit log ở các thao tác thay đổi dữ liệu.
- System: unit/integration test toàn workspace → E2E HTTP của core/signaling → browser E2E của
  web → build production → health-check stack Docker.
- Ngoài phạm vi ticket này: thay đổi business rule, thêm role mới hoặc thay ma trận permission
  hiện hành.

## 2. Ma trận vai trò và vị trí chặn

| Vai trò     | Web người dùng | Admin UI                                   | Admin API                                         | Kết quả |
| ----------- | -------------- | ------------------------------------------ | ------------------------------------------------- | ------- |
| `user`      | Được phép      | Hiện trạng thái không có quyền             | Bị `RolesGuard` chặn                              | PASS    |
| `moderator` | Được phép      | Được vào shell                             | Chỉ handler có permission hiện hành trong DB      | PASS    |
| `admin`     | Được phép      | Được vào shell                             | Theo permission DB; bảo toàn quyền quản trị cuối  | PASS    |
| Chưa login  | Route public   | Chuyển về `/login`                         | Bị authentication guard chặn                      | PASS    |
| Token cũ    | Theo auth flow | UX chỉ đọc claim, không phải security gate | Role/permission đọc lại DB nên downgrade tức thời | PASS    |

Các chốt thực thi:

- `apps/admin/src/shared/auth/require-auth.tsx:18`: chuyển người chưa đăng nhập về login và
  chặn rõ role `user` khỏi admin UI.
- `apps/core-api/src/modules/admin/admin.controller.ts:98`: mọi admin route yêu cầu role
  `admin` hoặc `moderator` ở class-level.
- `apps/core-api/src/modules/admin/services/admin-permission.guard.ts:32`: deny khi route thiếu
  permission metadata, thiếu identity hoặc DB policy không cấp quyền.
- `apps/core-api/src/modules/admin/admin.controller.spec.ts:4`: duyệt toàn bộ handler để bảo đảm
  route mới không thể quên khai permission.
- `apps/core-api/src/modules/admin/services/admin-permission.guard.spec.ts:59`: token cũ vẫn bị
  deny ngay sau khi role/policy trong DB bị hạ.

## 3. Assumption table

| Giả định                                                   | Vị trí chặn / bằng chứng                                        | Kết quả |
| ---------------------------------------------------------- | --------------------------------------------------------------- | ------- |
| Ẩn UI không được coi là biện pháp bảo mật                  | Backend có role guard và permission guard độc lập               | PASS    |
| Mọi admin handler phải có permission tường minh            | Controller coverage test theo metadata, deny-by-default         | PASS    |
| Moderator không mặc nhiên có toàn quyền                    | `hasPermission(userId, permission)` đọc policy hiện hành từ DB  | PASS    |
| Hạ role phải có hiệu lực trước khi access token hết hạn    | Permission guard đọc lại user/role từ DB                        | PASS    |
| Không thể tự ban hoặc hạ admin cuối cùng                   | Admin integration tests chạy với PostgreSQL thật                | PASS    |
| Ledger/refund vẫn tuân thủ append-only và idempotency      | Economy integration + HTTP E2E chạy với PostgreSQL thật         | PASS    |
| Refresh cookie và CSRF hoạt động sau full browser reload   | Playwright thực hiện OTP, reload, request ghép đôi nhận `200`   | PASS    |
| E2E không được chiếm/dừng API Docker của developer         | Core E2E cấp port ngẫu nhiên và teardown đúng process group     | PASS    |
| Signaling cần Redis thật để không bỏ qua integration tests | Chạy test với `REDIS_URL=redis://localhost:6379`                | PASS    |
| Build host không được làm hỏng trạng thái bàn giao Docker  | Dừng web khi build, chạy browser E2E, khởi động và health-check | PASS    |

## 4. Checklist boundary/correctness

- [x] Không thêm backend deployable thứ tư hoặc thay đổi ownership domain.
- [x] Frontend guard chỉ làm UX; backend giữ chốt quyền thật.
- [x] Permission admin deny-by-default và được kiểm tra tự động cho mọi route.
- [x] Admin integration test dùng PostgreSQL thật, không dùng cache.
- [x] Economy HTTP E2E kiểm tra CSRF, idempotency và ledger.
- [x] Auth E2E kiểm tra refresh cookie, CSRF và logout/reuse boundary.
- [x] Web browser E2E kiểm tra flow người dùng thật sau reload.
- [x] Signaling test chạy đủ cả unit và Redis integration, không còn test bị skip.
- [x] E2E core chạy trên tiến trình/cổng cô lập và chỉ dừng đúng tiến trình đã tạo.
- [x] Production build của core, admin, web và shared client đều thành công.
- [x] Stack Docker cuối cùng healthy và các HTTP endpoint chính trả thành công.

## 5. Bằng chứng test thật

| Lệnh / kiểm tra                                                                              | Kết quả                                                                |
| -------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------- |
| `INTEGRATION_DB_URL=... pnpm nx test core-api --skip-nx-cache --runInBand`                   | PASS — 64 suites, 706 tests với PostgreSQL thật                        |
| `INTEGRATION_DB_URL=... REDIS_URL=... pnpm nx run-many -t test --skip-nx-cache --parallel=3` | PASS — 10/10 projects; signaling 25 tests, không skip                  |
| `INTEGRATION_DB_URL=... REDIS_URL=... pnpm nx e2e core-api-e2e --skip-nx-cache`              | PASS — 4 suites, 12 HTTP E2E                                           |
| Signaling E2E với gateway Docker                                                             | PASS — 2/2 tests                                                       |
| `INTEGRATION_DB_URL=... REDIS_URL=... pnpm agent:verify core`                                | PASS — guard, format, OpenAPI, lint, 706 tests, build, 12 E2E          |
| `pnpm agent:verify frontend`                                                                 | PASS — lint; admin 50, web 219, api-client 23 tests; production builds |
| `CI=true INTEGRATION_DB_URL=... REDIS_URL=... pnpm nx e2e web --skip-nx-cache`               | PASS — OTP login, cookie restore, CSRF và matching queue browser flow  |
| `docker compose -f docker-compose.yml -f docker-compose.dev.yml ps`                          | PASS — core, signaling, web, admin, PostgreSQL, Redis đều healthy      |
| HTTP smoke `:3000/health`, `:4200/login`, `:4300`                                            | PASS                                                                   |
| `git diff --check`                                                                           | PASS                                                                   |

Browser evidence nằm tại
`apps/web/e2e/login-and-join-matching-queue.spec.ts:11`; HTTP auth/economy/health/webhook evidence
nằm trong bốn suite của `apps/core-api-e2e/src/core-api/`.

## 6. Kết luận

**PASS.** Các chức năng đã có được kiểm chứng từ domain/backend qua API, quyền quản trị, web
client, trình duyệt thật và stack Docker. Chốt quyền đúng vai trò, permission admin
deny-by-default, downgrade không phụ thuộc TTL token, và hạ tầng E2E không còn xung đột với
môi trường developer. Ticket kiểm thử có thể đóng trước khi bắt đầu ticket refactor.
