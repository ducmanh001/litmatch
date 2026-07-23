## Review — zero-cost production subset — verify — 2026-07-18

### 1. Scope/flow

Scope verify là profile release production một node, chi phí hạ tầng cố định 0 USD:

1. Caddy nhận TLS/HTTP và route tới web, admin, core API, signaling, LiveKit.
2. PostgreSQL, Redis, Kafka và LiveKit tự host trong cùng Compose; chỉ edge và cổng media
   bắt buộc được public.
3. Google OAuth và phone OTP là đường đăng nhập production; phone OTP trả mã trực tiếp qua API,
   không dùng SMS. Video upload, IAP và external push được tắt fail-closed do chưa có vendor
   credential/adapter miễn phí an toàn.
4. Release flow validate config, build artifact có tag, khởi động infra, backup PostgreSQL,
   migrate forward, khởi động app, smoke TLS và ghi release state; rollback chỉ đổi app image.
5. Alloy/Grafana Cloud và PostHog là profile hosted-monitoring tùy chọn, không chặn baseline.

Out of scope: thay Oracle/Grafana/PostHog bằng cam kết SLA, triển khai multi-node/HA, mua
domain, SMS, FCM/APNs hay store verification credential. Không tạo backend deployable thứ tư.

### 2. Assumptions

| Assumption                                          | Ai phá vỡ / cách phá vỡ                                          | Vị trí chặn                                                                                                                                            | Verdict |
| --------------------------------------------------- | ---------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ | ------- |
| Production không khởi động dev provider             | Operator chọn `dev` trong production                             | `economy/ports/iap-verifier.ts:73`, `notification/ports/push-provider.ts:42`, video storage/transcode bootstrap guards                                 | ✅      |
| Phone OTP không phụ thuộc SMS                       | Không có kênh SMS khi deploy production                          | `auth/services/otp.service.ts` trả `code` trong DTO; `auth/auth.service.ts:57-64,166-173` giữ flag trước DB side effect                                | ✅      |
| Video upload tắt trước DB/storage side effect       | Client gọi create/finalize trực tiếp                             | `short-video/short-video.service.ts:58-64,112-117`; unit test `:197-206`                                                                               | ✅      |
| IAP tắt trước ledger side effect                    | Client gửi receipt giả/hợp lệ                                    | disabled verifier `economy/ports/iap-verifier.ts:42-57` được gọi tại `economy.service.ts:299`, trước `ledger.record()` tại `:306`                      | ✅      |
| Tắt external push không làm mất in-app notification | Push provider không có vendor adapter                            | persist tại `notification.service.ts:44-75`; push best-effort sau commit tại `:78-91`; disabled provider no-op                                         | ✅      |
| Google token không được tin từ client               | Client giả token/provider subject                                | server verify issuer/audience/signature/sub trong `auth/services/social-verifier.ts`; auth chỉ tạo user sau verify tại `auth.service.ts:72-81`         | ✅      |
| UI capability khớp backend                          | Operator build frontend với phone OTP bật                        | release build ép hai frontend flag `true` tại `scripts/release/release.mjs:94-106`; Compose ép backend `true` tại `deploy/production/compose.yml:95`   | ✅      |
| Secret và image tag có một nguồn                    | Operator bỏ thiếu/giữ placeholder/secret yếu                     | required + validation `scripts/release/release-config.mjs:3-102`; DB URL/image sinh từ cùng config tại `:105-115`; Compose dùng `:?required`           | ✅      |
| DB/cache/metrics không public                       | Operator không tự sửa Compose/firewall                           | chỉ edge `80/443`, LiveKit `7881` + UDP `50000-50200`; Alloy bind `127.0.0.1` trong `deploy/production/compose.yml:64-75,147-191`                      | ✅      |
| Migration có backup và rollback không down-migrate  | Release script được dùng thay vì lệnh tay                        | thứ tự backup → migrate → app → smoke tại `scripts/release/release.mjs:217-233`; rollback image tại `:236-249`                                         | ✅      |
| Economy invariant không bị capability flag làm yếu  | Race/replay/refund hoặc code sửa ledger cũ                       | DB unique/append-only `1752000000000-economy-ledger.ts:32-80,117-128`; atomic lock/write `ledger.service.ts:111-189`; PostgreSQL integration thật PASS | ✅      |
| Single-node hết capacity/VM lỗi là giới hạn đã biết | Traffic vượt 2 OCPU/12 GB hoặc VM/region không còn free capacity | ADR 0008 và `docs/runbooks/zero-cost-production.md` ghi rõ capacity, backup và hướng nâng cấp                                                          | ✅      |

### 3. Checklist

| Hạng mục                         | Bằng chứng                                                                                                     | Kết quả |
| -------------------------------- | -------------------------------------------------------------------------------------------------------------- | ------- |
| Boundary/deployable invariant    | Compose chỉ chạy `core-api`, `signaling-gateway`, `media-server` (LiveKit) phía backend; `pnpm agent:check`    | ✅      |
| Auth fail-closed + Google OAuth  | Backend guard, server token verifier, shared `browser-auth`, admin/web tests và build                          | ✅      |
| Short-video fail-closed          | Guard đầu create/finalize, provider bootstrap guard, unit test không DB/storage call                           | ✅      |
| Economy correctness              | Disabled verifier trước ledger; double-entry append-only, DB idempotency và integration PostgreSQL không cache | ✅      |
| Notification degradation         | In-app persist độc lập; disabled push no-op; push fail không rollback luồng gốc                                | ✅      |
| Config single source             | Release parser/validator tests; Compose config PASS; không default secret                                      | ✅      |
| Security/privacy                 | TLS edge, private data services, production dev-provider guards, no credential trong repo                      | ✅      |
| Release/rollback                 | Immutable local image tag, pre-migration backup, forward migration, TLS smoke, app-image rollback              | ✅      |
| Observability                    | Health/metrics sẵn có; Alloy optional; hosted monitoring runbook có masking/consent                            | ✅      |
| Docs/runbook/ADR                 | ADR 0008, tech-stack, service docs và zero-cost runbook đồng bộ implementation                                 | ✅      |
| Matching/calling/gift/party/feed | Không đổi business semantics trong ticket này; full core/frontend/E2E gates vẫn PASS                           | ✅      |

### 4. Tests

| Lệnh/kiểm tra                                                                                                                            | Kết quả thật                                                                             |
| ---------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------- |
| `pnpm format:check`                                                                                                                      | PASS                                                                                     |
| `pnpm agent:verify frontend`                                                                                                             | PASS — admin 13 files/51 tests; web 61 files/224 tests; api-client 23 tests; builds PASS |
| `pnpm agent:verify infra`                                                                                                                | PASS                                                                                     |
| `pnpm agent:verify core`                                                                                                                 | PASS — 65 suites/712 tests; build; core E2E 4 suites/12 tests                            |
| `INTEGRATION_DB_URL=postgresql://litmatch:litmatch_local@127.0.0.1:5432/litmatch_test pnpm nx test core-api --skip-nx-cache --runInBand` | PASS — PostgreSQL thật, 65 suites/712 tests                                              |
| `pnpm agent:check`                                                                                                                       | PASS                                                                                     |
| `pnpm agent:test`                                                                                                                        | PASS — 48/48 checks                                                                      |
| `pnpm openapi:check`                                                                                                                     | PASS                                                                                     |
| `node --test scripts/release/release-config.test.mjs`                                                                                    | PASS — 2/2 tests                                                                         |
| `docker compose --env-file <safe-smoke-env> -f deploy/production/compose.yml config --quiet`                                             | PASS                                                                                     |
| build `litmatch/web:release-smoke`, start container, HTTP landing smoke                                                                  | PASS                                                                                     |
| build `litmatch/edge:release-smoke`, `caddy validate`                                                                                    | PASS                                                                                     |
| Core API thật với `NODE_ENV=production`, PostgreSQL/Redis, OTP enabled                                                                   | `/health/ready` 200; OTP request trả `data.code` + `data.ttlSeconds`                     |

Full gate ban đầu phát hiện signature của `DisabledIapVerifier` không khớp abstract port;
implementation đã được sửa giữ nguyên ba tham số, sau đó full core gate và integration DB
đều PASS. Đây là bằng chứng gate đã bắt lỗi thật, không phải kết quả cache.

### 5. Conclusion

**PASS.** Profile zero-cost production đủ điều kiện release sau khi người vận hành cung cấp
VM public IP, Google OAuth client và secret trong `deploy/production/.env`. Ba capability cần
vendor trả phí/credential (video upload, IAP, external push) được tắt minh bạch và fail-closed;
phone OTP hoạt động bằng response API không dùng SMS. Các chức năng còn lại, in-app notification,
Google login, realtime/calling, admin, monitoring và release lifecycle giữ nguyên trong profile này.
