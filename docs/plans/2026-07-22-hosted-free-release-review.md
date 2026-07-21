## Review — hosted-free-release — verify — 2026-07-22

### 1. Phạm vi & luồng nghiệp vụ

`CI required xanh cho SHA đầy đủ → checkout đúng SHA → migration PostgreSQL forward-only → build/deploy Core API + Signaling cùng SHA → deploy Web + Admin → smoke bốn public endpoint`

Profile này chỉ dành cho alpha/demo trong free quota. Ba backend deployable vẫn là Core API,
Signaling Gateway và Media Server; LiveKit Cloud chỉ thay nơi chạy Media Server, không tạo domain
backend thứ tư.

### 2. Bảng giả định

| #   | Giả định                                                             | Ai phá / cách phá                                                  | Chặn ở đâu                                                                                                                                                                                                                      | Verdict      |
| --- | -------------------------------------------------------------------- | ------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------ |
| 1   | Chỉ commit đã qua CI mới được release                                | Người vận hành nhập SHA tùy ý hoặc CI đỏ                           | `.github/workflows/hosted-release.yml:4`, `.github/workflows/hosted-release.yml:26`, `.github/workflows/hosted-release.yml:62` kiểm tra workflow thành công và check `CI required` của SHA manual                               | ✅ chặn đúng |
| 2   | Schema phải tương thích trước khi service mới nhận traffic           | Migration lỗi nhưng pipeline vẫn deploy                            | `.github/workflows/hosted-release.yml:71` chạy migration trước bước Northflank; mặc định step lỗi dừng job                                                                                                                      | ✅ chặn đúng |
| 3   | Core API và Signaling cùng chạy chính xác SHA đã kiểm chứng          | Provider tự build HEAD mới hơn                                     | `.github/workflows/hosted-release.yml:31`, `scripts/release/northflank-deploy.mjs:39` truyền SHA đầy đủ vào hai combined-service build và poll đến terminal success                                                             | ✅ chặn đúng |
| 4   | Upstash TLS URL dùng được ở cả hai backend                           | URL `rediss://` bị validation từ chối                              | `apps/core-api/src/config/env.validation.ts:167`, `apps/signaling-gateway/src/config/env.validation.ts:27` cho phép `redis` và `rediss`; unit test khóa hành vi                                                                 | ✅ chặn đúng |
| 5   | Refresh cookie cross-site không bị browser loại nhưng vẫn chống CSRF | Sai `SameSite`, thiếu Secure hoặc mở CORS wildcard                 | `apps/core-api/src/modules/auth/auth.cookies.ts:27` buộc production theo config và `secure` khi `none`; `deploy/hosted/core-api.env.example:5` dùng exact origin, dòng 11 đặt `none`; CSRF guard hiện hành vẫn áp dụng          | ✅ chặn đúng |
| 6   | Kafka không cần chạy trong profile miễn phí                          | Bật luồng phụ thuộc broker hoặc relay ngoài ý muốn                 | `deploy/hosted/core-api.env.example:14` tắt outbox relay và dòng 15 tắt refund poll; transaction/ledger vẫn commit trong PostgreSQL, các tính năng async này được ghi rõ out-of-scope alpha                                     | ✅ chặn đúng |
| 7   | LiveKit secret chỉ tồn tại ở backend                                 | Biến secret bị đưa vào bundle frontend                             | `deploy/hosted/core-api.env.example:19` giữ API key/secret ở Core; `.github/workflows/hosted-release.yml:42` chỉ đưa public WebSocket URL vào `NEXT_PUBLIC_*`                                                                   | ✅ chặn đúng |
| 8   | Release fail-closed khi provider hoặc public endpoint lỗi            | API provider trả build failed, timeout hoặc endpoint chưa sẵn sàng | `scripts/release/northflank-deploy.mjs:66` kiểm tra terminal status; `.github/workflows/hosted-release.yml:79` retry smoke rồi fail job                                                                                         | ✅ chặn đúng |
| 9   | Không commit credential thật                                         | Người cấu hình thay placeholder trong Git                          | `deploy/hosted/core-api.env.example:6`, `deploy/hosted/signaling-gateway.env.example:6` chỉ chứa placeholder; credential thật đi qua GitHub Secrets theo `docs/runbooks/hosted-free-release.md:25`; repository secret scan PASS | ✅ chặn đúng |
| 10  | Hết free quota không được hiểu là SLA production                     | Traffic, inactivity policy hoặc provider đổi quota                 | `docs/adr/0009-hosted-free-alpha-release-profile.md:12` giới hạn profile ở alpha/demo và runbook yêu cầu theo dõi quota; không có cam kết always-available                                                                      | ✅ chặn đúng |

### 3. Checklist áp dụng

| Mục                             | Kết quả | Ghi chú                                                                                               |
| ------------------------------- | ------- | ----------------------------------------------------------------------------------------------------- |
| Boundary ba backend             | PASS    | Không thêm app backend; dùng đúng Core, Signaling và managed LiveKit                                  |
| Economy ledger/idempotency      | PASS    | Không sửa entity, migration hay ledger; integration PostgreSQL thật PASS                              |
| Atomicity và migration          | PASS    | Migration chạy trước deploy và fail-closed; không sửa migration cũ                                    |
| Authentication/authorization    | PASS    | Cookie `SameSite=None` luôn `Secure`; exact CORS và CSRF hiện hành được giữ                           |
| Secret/privacy                  | PASS    | Chỉ public URL/Google client ID vào frontend; provider token, DB và LiveKit secret dùng server secret |
| Retry/idempotency               | PASS    | Release khóa concurrency, deploy exact SHA; smoke và provider polling có timeout                      |
| Failure isolation/observability | PASS    | Provider/build/smoke lỗi làm job đỏ; profile alpha ghi rõ giới hạn quota và chức năng tắt             |
| Docs/ADR/runbook                | PASS    | Architecture, tech stack, frontend auth, ADR index và runbook đã đồng bộ                              |

### 4. Test đã chạy

- `pnpm agent:verify infra` → PASS.
- `pnpm agent:verify frontend` → PASS; API client 23, Admin 51, Web 224 test; lint và production build PASS.
- `pnpm agent:verify core` → PASS; 716 unit test, 12 E2E, lint, migration và build PASS.
- `pnpm agent:verify signaling` → PASS; 26 unit test, 2 E2E, lint và build PASS.
- `pnpm agent:verify calling` → PASS; 716 test, lint và build PASS.
- `INTEGRATION_DB_URL=postgresql://litmatch:litmatch_local@localhost:5432/litmatch_test pnpm agent:verify economy --skip-nx-cache` → PASS với PostgreSQL thật, 716 test, lint và build PASS.
- `NEXT_PUBLIC_API_URL=https://api.example.com NEXT_PUBLIC_SOCKET_URL=https://realtime.example.com NEXT_PUBLIC_LIVEKIT_URL=wss://media.example.com NEXT_PUBLIC_PHONE_OTP_ENABLED=false pnpm nx run web:cloudflare-build --skipNxCache` → PASS.
- `docker build -f deploy/hosted/Dockerfile.core-api -t litmatch/core-api:hosted-test .` → PASS.
- `docker build -f deploy/hosted/Dockerfile.signaling-gateway -t litmatch/signaling-gateway:hosted-test .` → PASS.
- `pnpm agent:test` → 51/51 PASS, gồm ba test release Northflank.
- `pnpm ci:local:quick` → PASS; actionlint, format và lint toàn bộ 14 Nx project PASS.

### 5. Kết luận: PASS

Code, config, tài liệu và test đã đủ cho profile hosted free alpha. Việc provision thực tế chỉ còn
phụ thuộc đăng nhập/tạo tài nguyên trong bốn tài khoản provider và nạp secret/variable vào GitHub;
đây là external account setup, không phải khoảng trống correctness trong implementation.
