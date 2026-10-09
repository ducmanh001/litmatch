# SỔ TAY CHỦ DỰ ÁN LITMATCH — TUYỆT MẬT / LOCAL ONLY

> Phân loại: OWNER-ONLY. File này chứa bản đồ kiến trúc, quyền quản trị và quy trình ứng cứu.
> Không commit, không gửi qua chat/email, không đưa vào ticket, log, ảnh chụp màn hình hoặc AI
> bên ngoài workspace. File đang được loại khỏi Git bằng `.git/info/exclude` và phải có quyền
> `0600`. Đây KHÔNG phải mã hoá: ai chiếm được tài khoản/máy chủ vẫn có thể đọc file. Secret thật
> phải nằm trong password manager/Vault/secret manager, tuyệt đối không chép vào đây.

Ngày đối chiếu với mã nguồn: 2026-07-15.

---

## 0. Thông tin truy cập local hiện tại

### Tài khoản quản trị local

- Admin URL: `http://localhost:4200/login`
- Số nhập trên giao diện: `0900000001`
- Số lưu ở API/identity: `+84900000001`
- User ID local: `527e4d15-3cc6-4b48-aa29-9d14f53effb6`
- Role: `admin`
- Status: `active`
- Không có mật khẩu cố định. Tài khoản đăng nhập bằng OTP.

Tài khoản này chỉ tồn tại trong PostgreSQL volume local hiện tại. Nó không phải tài khoản
staging/production và không được dùng số giả này ở môi trường public.

### Lấy OTP local

1. Bật hệ thống:

   ```bash
   pnpm dev:up
   ```

2. Mở `http://localhost:4200/login`, nhập `0900000001`, bấm gửi OTP.
3. Mở terminal khác và đọc mã 6 số:

   ```bash
   docker compose -f docker-compose.yml -f docker-compose.dev.yml \
     logs -f --tail=50 core-api | rg --line-buffered 'DEV-ONLY SMS'
   ```

4. Nhập mã mới nhất. OTP mặc định hết hạn sau 300 giây; xin mã mới làm mã cũ vô hiệu.

Nếu giao diện báo không đủ quyền dù DB đã là admin: logout rồi đăng nhập lại để JWT mới mang
role hiện tại. Role nằm trong access token, không được frontend tự đặt.

### Tính bền vững của tài khoản local

- `pnpm dev:down`: dừng container, giữ volume và tài khoản.
- `pnpm dev:up`: bật lại, tài khoản vẫn còn.
- `pnpm infra:reset` hoặc `docker compose ... down --volumes`: xoá dữ liệu local; phải tạo lại.
- Không copy volume/database local lên production.

---

## 1. Mô hình hệ thống phải nắm trước khi quản lý

```text
Browser người dùng                 Browser vận hành
apps/web :4300                     apps/admin :4200
        \                              /
         \ REST + JWT/cookie          /
          v                           v
             core-api :3000
       (NestJS modular monolith, toàn bộ business rule)
          |             |                 |
          | Redis delta | LiveKit control | PostgreSQL source of truth
          v             v                 v
 signaling-gateway   media-server      postgres
 Socket.IO :3001     LiveKit :7880
```

Ba backend deployable duy nhất là:

1. `apps/core-api`: mọi business logic, dữ liệu, auth, RBAC và API.
2. `apps/signaling-gateway`: kết nối Socket.IO/fanout realtime; không quyết định nghiệp vụ.
3. `apps/media-server`: LiveKit self-host, truyền media; không chứa business logic/DB.

`apps/admin` và `apps/web` là client. Chúng có thể deploy riêng nhưng không được trở thành nguồn
sự thật nghiệp vụ. Postgres là nguồn sự thật cho trạng thái bền vững; Redis là queue/cache/pubsub;
Kafka phục vụ event pipeline; LiveKit chỉ giữ media/room runtime.

### Bản đồ mã nguồn

| Khu vực              | Nguồn chính                                                                | Trách nhiệm                                |
| -------------------- | -------------------------------------------------------------------------- | ------------------------------------------ |
| Hợp đồng toàn repo   | `AGENTS.md`                                                                | Ba invariant cứng và quy trình hoàn tất    |
| Mục lục tài liệu     | `docs/00-overview-and-index.md`                                            | Điều hướng toàn bộ spec/ADR/service docs   |
| Kiến trúc            | `docs/03-architecture.md`                                                  | Boundary, scale, ba deployable             |
| Luật nghiệp vụ       | `docs/06-domain-rules.md`                                                  | Quy tắc không được tự đoán                 |
| Review bảo mật/logic | `docs/10-code-review-checklist.md`                                         | Business logic vulnerability, concurrency  |
| Nguyên tắc thiết kế  | `docs/11-engineering-principles.md`                                        | Ownership, correctness, YAGNI              |
| Frontend             | `docs/12-frontend-architecture.md`, `docs/13-frontend-coding-standards.md` | Boundary Admin/Web                         |
| Backend              | `apps/core-api/src/modules/*`                                              | Module nghiệp vụ NestJS                    |
| Admin                | `apps/admin/src`                                                           | SPA vận hành nội bộ                        |
| Website              | `apps/web/src`                                                             | Next.js cho end user                       |
| API contract         | `openapi/core-api.json`                                                    | Contract sinh từ backend                   |
| Client API           | `libs/api-client`                                                          | Cách duy nhất frontend gọi REST            |
| Database             | `apps/core-api/src/database/migrations`                                    | Schema chỉ tiến bằng migration mới         |
| Local infra          | `docker-compose.yml`, `docker-compose.dev.yml`                             | Postgres/Redis/Kafka và full dev stack     |
| Production scaffold  | `k8s/`                                                                     | Kustomize base/staging/production          |
| Load/capacity        | `loadtest/`                                                                | Test signaling, matching, calling, LiveKit |

### Module backend hiện có

`admin`, `auth`, `avatar`, `calling`, `discovery`, `economy`, `feed`, `friend`, `gift`,
`matching`, `mini-game`, `mood`, `movie-match`, `notification`, `palm-match`, `party-room`,
`safety`, `short-video`, `soul-match`, `user`.

Module sở hữu dữ liệu/rule của nó. Module khác chỉ đi qua public API/DTO/event; không query bảng
nội bộ của nhau để đi tắt.

---

## 2. Ba luật bất biến của dự án

### Luật 1 — Không tự sinh backend service thứ tư

Domain mới mặc định là NestJS module trong `core-api`. Chỉ tách service khi có số liệu vận hành
đạt tiêu chí `docs/03 §3.4`, có ADR được chấp nhận, và cùng lúc cập nhật `AGENTS.md`, architecture,
guard, deployment, migration/rollback. Không tạo app trước rồi hợp thức hoá sau.

### Luật 2 — Diamond là sổ cái kép append-only

- `LedgerEntry` là nguồn sự thật; `Wallet.balance` chỉ là snapshot có thể rebuild.
- Mỗi transaction tiền phải cân Nợ/Có theo currency.
- Idempotency key unique ở DB trên `Transaction`.
- Không update/xoá ledger cũ. Sửa sai bằng reversal entry mới trỏ giao dịch gốc.
- Refund thủ công phải có actor + lý do + audit, chạy trong transaction đúng.
- Diamond không hết hạn, không rút thành tiền thật, không chuyển trực tiếp user-to-user.
- Gift trừ DIA ở người gửi và cộng PTS theo tỷ lệ cho người nhận; không trả DIA 1:1.

### Luật 3 — Chưa verify thì chưa được nói “xong”

Mọi thay đổi phải nạp context đúng scope, viết test, chạy gate áp dụng và chạy `review-module`
mode `verify`. `verify` FAIL nghĩa là task chưa hoàn tất. Không lách guard, không tin mỗi lint/build,
không bỏ test race/integration ở luồng nhạy cảm.

### Các invariant bổ sung phải giữ

- Correctness + security đứng trước performance.
- Frontend không quyết định giá, role, balance, VIP, trust, match state hoặc quyền sở hữu.
- Server validate tất cả boundary và luôn kiểm tra ownership/RBAC ở backend.
- REST qua `@litmatch/api-client`; đổi backend contract phải chạy `pnpm openapi:sync`.
- Secret/PII không hardcode, không log. Dev-only provider phải chết cứng ở production.
- Side effect phải idempotent và atomic; không “check rồi làm” nếu request song song có thể chen.
- Migration mới là cách duy nhất đổi schema; không sửa migration đã chạy, không bật synchronize.
- Realtime là delta. Sau reconnect phải refetch REST vì event có thể đã bị bỏ lỡ.
- Audit admin, report, block và ledger là append-only theo hợp đồng tương ứng.
- Không nới Party Room capacity hoặc media topology nếu chưa có load test + headroom.
- Ẩn UI/route ở frontend chỉ là UX; backend guard mới là chốt bảo mật.

---

## 3. Vận hành Admin SPA

### Cơ chế đăng nhập và quyền

1. Admin SPA chuẩn hoá số Việt Nam sang E.164.
2. `POST /api/v1/auth/otp/request` tạo OTP 6 số.
3. Dev log OTP; production phải có SMS provider thật.
4. `POST /api/v1/auth/otp/verify` xác minh một lần, tìm/tạo identity và user.
5. Backend phát access JWT ngắn hạn + refresh cookie HTTP-only + CSRF token.
6. JWT chứa `sub`, `isGuest`, `role`; backend `RolesGuard` kiểm tra role.
7. Refresh token rotation đọc role hiện tại từ DB, nên nâng/hạ quyền có hiệu lực ở token mới.

Mặc định access token sống 900 giây, refresh sống 30 ngày. Refresh token chỉ lưu hash trong DB,
cookie có `httpOnly`, `sameSite=strict`, `secure=true` ở production và path `/api/v1/auth`.

### Cảnh báo quyền hiện tại

Backend đang dùng class-level:

```text
RequireRoles(admin, moderator) -> toàn bộ /api/v1/admin/*
```

Nghĩa là role `moderator` hiện cũng qua được tất cả endpoint trong `AdminController`, gồm users,
moderation, gift và economy/refund. Màn `/permissions` chỉ là demo, chưa có granular permission
backend. Trước public launch có nhiều nhân viên, phải tách capability rõ ràng; không cấp
`moderator` với giả định rằng họ chỉ xem report.

Frontend giải mã role để hiển thị UX, nhưng token lỗi/không giải mã được có thể vẫn đi qua UI.
Điều này không phải bypass backend: API vẫn chặn bằng chữ ký JWT + RolesGuard. Không bao giờ dùng
frontend guard làm bằng chứng an toàn.

### Chức năng thật và demo

| Route          | Trạng thái         | Chức năng                                                       |
| -------------- | ------------------ | --------------------------------------------------------------- |
| `/`            | Một phần thật      | Dashboard; “phòng đang live” thật, card khác có thể demo        |
| `/users`       | Thật               | List/filter user, xem hồ sơ, ban/unban; không tự ban chính mình |
| `/moderation`  | Thật               | Report resolve/dismiss; video pending approve/reject/remove     |
| `/gifts`       | Thật               | List/create/update giá, tên, thứ tự, bật/tắt; không hard-delete |
| `/economy`     | Thật, cực nhạy cảm | Tra ví, lịch sử transaction, reversal/refund có lý do           |
| `/rooms`       | Thật, read-only    | Xem Party Room live; chưa có nút kết thúc phòng                 |
| `/config`      | Demo local state   | Không persist, không có API thật                                |
| `/permissions` | Demo local state   | Không phải hệ phân quyền thật, không persist                    |

Mọi mutation thật của Admin phải đi qua `apps/core-api/src/modules/admin`, ghi
`admin_audit_logs` cùng transaction khi hành động cần atomic. Bảng audit có trigger chặn
UPDATE/DELETE.

### API quản trị hiện có

- Users: list/detail, ban, unban.
- Reports: list, resolve, dismiss.
- Videos: list pending, approve, reject, remove.
- Gifts: list tất cả, create, patch.
- Economy: get wallet, list transaction theo user, refund/reversal.

Swagger local: `http://localhost:3000/docs`. Swagger production phải tắt hoặc bảo vệ; không coi
Swagger là giao diện vận hành production.

### Cấp admin mới đúng cách

Không có endpoint “tự nâng admin” và migration không seed admin. Đây là cố ý để client không thể
gửi `role=admin`.

Quy trình production/staging phải là one-off operation có phê duyệt:

1. Người nhận đăng nhập bình thường, tạo phone identity bằng SMS thật.
2. Ops xác định đúng `userId` từ `auth_identities(provider='phone', provider_uid='<E.164>')`.
3. Chụp backup/snapshot và ghi change ticket: ai yêu cầu, ai duyệt, lý do, thời điểm.
4. Trong kết nối DB bảo mật, transaction update đúng một row `users.role='admin'`.
5. Assert row count đúng 1; sai 0 hoặc >1 thì rollback và điều tra.
6. Thu hồi session cũ hoặc yêu cầu logout/login để JWT mới lấy role hiện tại.
7. Gọi một endpoint read-only `/api/v1/admin/users?limit=1&offset=0` để kiểm tra.
8. Ghi lại việc cấp quyền vào hệ audit ngoài DB. Update role trực tiếp hiện chưa tự ghi vào
   `admin_audit_logs`, đây là khoảng trống governance cần nhớ.

Không dùng chung một admin, không dùng số điện thoại cá nhân của khách hàng, không copy cookie/JWT
giữa máy, không cấp quyền vĩnh viễn cho support tạm thời.

### Thu hồi admin khẩn cấp

1. Khoá quyền truy cập DB/cluster của người bị nghi lộ.
2. Transaction hạ `users.role` về `user` hoặc set `status='banned'` theo quyết định incident.
3. Set `refresh_tokens.revoked_at=now()` cho toàn bộ token của user đó.
4. Access JWT đã phát là stateless nên có thể còn hiệu lực tối đa `JWT_ACCESS_TTL_SECONDS`
   (mặc định 15 phút). Nếu cần cắt ngay, rotate `JWT_SECRET` cho cả core-api và signaling-gateway,
   redeploy đồng bộ; việc này logout toàn bộ người dùng.
5. Kiểm tra `admin_audit_logs` theo `actor_user_id`, trace/request logs và transaction/reversal.
6. Không xoá dấu vết. Giữ snapshot/log, lập timeline, sau đó mới phục hồi.

Không sửa/xoá ledger để “hoàn tác hacker”; mọi sửa tiền vẫn phải là reversal có actor/reason.

---

## 4. Quản lý Website người dùng

### Nhóm route hiện có

| Nhóm          | Route chính                                                 | Ý nghĩa                                 |
| ------------- | ----------------------------------------------------------- | --------------------------------------- |
| Public        | `/`, `/help`, `/privacy`, `/login`                          | Landing/SEO/trợ giúp/đăng nhập          |
| Home          | `/home`                                                     | Trang vào sau AuthGate                  |
| Feed          | `/feed`, `/feed/[postId]`                                   | Post, like, comment                     |
| Discovery     | `/discovery`                                                | Duyệt hồ sơ theo rule privacy/safety    |
| Matching      | `/matching`                                                 | Soul/Voice queue và invite              |
| Soul/Voice    | `/matching/soul/[sessionId]`, `/matching/voice/[sessionId]` | Phiên ghép/call                         |
| Friend        | `/friends`, `/chat/[friendUserId]`                          | Bạn bè và chat 1-1                      |
| Party         | `/party`, `/party/[roomId]`                                 | Danh sách/phòng nhóm LiveKit            |
| Video         | `/video`                                                    | Short-video feed/upload/moderation flow |
| Wallet        | `/wallet`                                                   | Số dư, IAP dev/store, VIP               |
| Profile       | `/profile`, `/profile/edit`                                 | Xem/sửa hồ sơ                           |
| Entertainment | `/movie-match`, `/palm-match`                               | Xem cùng bạn bè, nội dung palm match    |

### Luồng dữ liệu frontend

- Route/page chỉ ghép UI và feature component.
- Feature gọi `apiClient`, không fetch tay và không tự định nghĩa lại API type.
- TanStack Query giữ server state; không copy server state sang store/useState rồi coi đó là thật.
- Token store giữ access session phía browser; refresh token chỉ ở cookie HTTP-only.
- Socket.IO chỉ qua singleton `shared/realtime/socket.ts`.
- LiveKit chỉ qua `shared/media/livekit.ts`.
- Reconnect socket/media phải refetch REST và cleanup listener khi unmount.
- Public landing SSR/SEO; phần `(app)` là client-heavy sau `AuthGate`.
- Không tạo `app/api/` để lách core-api; Next route handler bị cấm trong kiến trúc hiện hành.

### Những quyết định frontend tuyệt đối không được tin client

Giá diamond/gift/VIP, balance, role, age policy, trust score, block/report, participant/membership,
match/call state, thời lượng tính phí và quyền xem resource đều do backend quyết định. UI chỉ
validate format và phản ánh response.

---

## 5. Chạy dự án và thay đổi mã nguồn

### Lần đầu trên máy mới

```bash
cp .env.example .env
cp apps/admin/.env.example apps/admin/.env.local
cp apps/web/.env.example apps/web/.env.local
pnpm dev:up
```

Địa chỉ local:

- Web: `http://localhost:4300`
- Admin: `http://localhost:4200`
- Core API: `http://localhost:3000`
- Swagger: `http://localhost:3000/docs`
- Signaling: `http://localhost:3001`
- LiveKit: `ws://localhost:7880`

### Mỗi ngày

```bash
pnpm dev:up
pnpm dev:ps
pnpm dev:logs
```

### Theo loại thay đổi

| Thay đổi                 | Hành động                                                             |
| ------------------------ | --------------------------------------------------------------------- |
| Source `.ts/.tsx/.css`   | Hot reload; xem log/test feature                                      |
| Dependency/lockfile      | `pnpm dev:install && pnpm dev:up`                                     |
| `Dockerfile.dev`         | `pnpm dev:rebuild`                                                    |
| Compose/service/config   | `pnpm dev:up`                                                         |
| Env key                  | Sửa schema + `.env.example` + secret/config deployment; `pnpm doctor` |
| Database schema          | Tạo migration mới; `pnpm dev:up`; không sửa migration cũ              |
| Backend request/response | Sửa DTO/controller, test, `pnpm openapi:sync`                         |
| Admin UI                 | Đọc `apps/admin/AGENTS.md`, test/lint/build admin                     |
| Web UI                   | Đọc `apps/web/AGENTS.md`, test/lint/build web                         |
| Infra/runtime baseline   | `pnpm agent:context infra`; cập nhật docs/ADR/deployment đồng bộ      |

### Quy trình bắt buộc cho một thay đổi

```text
Xác nhận objective/out-of-scope/acceptance
-> pnpm agent:context <scope>
-> đọc AGENTS.md gần nhất + canonical docs
-> review-module plan nếu là flow/module mới
-> code + test song song
-> migration/OpenAPI/docs đồng bộ nếu áp dụng
-> pnpm agent:check + test/lint/build áp dụng
-> review-module verify
-> chỉ bàn giao khi PASS
```

Lệnh thường dùng:

```bash
pnpm doctor
pnpm db:status
pnpm agent:check
pnpm agent:test
pnpm format:check
pnpm lint
pnpm test
pnpm build
pnpm ci:local:quick
pnpm ci:preflight
```

Economy phải chạy integration test Postgres thật, bỏ Nx cache theo lệnh trong `AGENTS.md`.

### Git và review

- Không commit `.env`, token, cookie, database dump, private key, OTP log hoặc file này.
- Không dùng `git add .` mù quáng; xem `git status` và `git diff --staged`.
- Một commit một mục đích, Conventional Commits theo `docs/15-commit-guidelines.md`.
- Worktree bẩn có thể chứa việc người khác: không reset/format/sửa file ngoài scope.
- Gitleaks/audit/Trivy chạy qua `pnpm ci:local:security` hoặc `pnpm ci:preflight`.

---

## 6. Secret và cấu hình nhạy cảm

### Secret thật phải nằm ở đâu

- Local: `.env` chỉ trên máy dev, quyền file hạn chế.
- Staging/production: Vault/external-secrets hoặc sealed-secrets; công cụ cụ thể hiện chưa chốt.
- K8s manifests trong repo chỉ có `REPLACE_ME`, tuyệt đối không điền giá trị thật rồi commit.
- `NEXT_PUBLIC_*` và `VITE_*` được bundle xuống browser: luôn coi là công khai, không đặt secret.

### Nhóm secret tối quan trọng

| Nhóm             | Key/nguồn                                           | Hậu quả nếu lộ                                                     |
| ---------------- | --------------------------------------------------- | ------------------------------------------------------------------ |
| JWT              | `JWT_SECRET`                                        | Giả mạo access token; core-api và signaling phải dùng cùng giá trị |
| OTP              | `AUTH_OTP_PEPPER`                                   | Giảm an toàn hash OTP đang lưu                                     |
| Database/cache   | `DATABASE_URL`, `REDIS_URL`                         | Đọc/sửa dữ liệu, chiếm session/queue                               |
| LiveKit          | `LIVEKIT_API_KEY`, `LIVEKIT_API_SECRET`             | Mint token/control room/media                                      |
| Apple/Google     | `ECONOMY_*SECRET`, private key, service-account key | Giả/chiếm luồng IAP/refund API                                     |
| Cluster/registry | kubeconfig, registry token, cloud credential        | Deploy image độc/hạ hệ thống                                       |
| DNS/TLS          | Cloudflare/API token, TLS private key               | Chiếm traffic/MITM/domain                                          |

Không ghi giá trị vào log. Khi rotate:

- JWT: thay đồng bộ core-api + signaling; toàn bộ access token cũ mất hiệu lực.
- OTP pepper: OTP đang sống mất hiệu lực; thông báo vận hành và để client xin mã mới.
- LiveKit key/secret: thay đồng bộ cấu hình LiveKit + core-api, có rollout plan tránh làm rớt room.
- DB/Redis: rotate credential ở provider, cập nhật secret store, rollout và kiểm tra readiness.
- Store keys: rotate tại Apple/Google, cập nhật secret store, test sandbox trước production.

### Dấu hiệu lộ secret

JWT hợp lệ bất thường, admin action không rõ actor, OTP spam, refresh reuse, LiveKit room lạ,
IAP/refund không khớp, deploy/image không có commit SHA, DB query/egress bất thường. Khi thấy:

1. Cô lập quyền truy cập, không xoá log.
2. Chụp snapshot và timeline.
3. Rotate credential theo blast radius.
4. Revoke session/role liên quan.
5. Đối soát admin audit + economy ledger + provider receipt.
6. Khôi phục bằng write path hợp lệ; không sửa lịch sử.
7. Sau incident mới sửa lỗ hổng, thêm test và cập nhật runbook.

---

## 7. Database, backup và khôi phục

### Nguyên tắc

- Postgres là nguồn sự thật; backup phải gồm dữ liệu và lịch sử migration.
- Không dùng Redis/Kafka dump thay PostgreSQL backup.
- Backup chỉ có giá trị khi restore drill đã chạy thành công.
- Dump có PII/ledger là secret cấp cao; mã hoá at rest và giới hạn người đọc.

### Backup local trước thao tác rủi ro

```bash
mkdir -p backups
docker compose -f docker-compose.yml -f docker-compose.dev.yml \
  exec -T postgres pg_dump -U litmatch -d litmatch --format=custom \
  > "backups/litmatch-$(date +%Y%m%d-%H%M%S).dump"
```

Thư mục `backups/` phải được exclude riêng trước khi dùng; không commit dump. Production phải dùng
snapshot/PITR của managed Postgres hoặc quy trình đã được platform owner phê duyệt, không copy
nguyên lệnh local này.

### Kiểm tra trước/sau deploy

```bash
pnpm db:status
curl -fsS http://localhost:3000/health/live
curl -fsS http://localhost:3000/health/ready
curl -fsS http://localhost:3001/health/ready
```

- Liveness chỉ chứng minh process sống.
- Core readiness kiểm tra PostgreSQL + Redis.
- Signaling readiness kiểm tra Redis subscription + cluster adapter.
- Migration fail thì dừng rollout; không ép app chạy trên schema nửa cũ/nửa mới.

### Không được làm

- Không `TRUNCATE`, `DROP`, sửa ledger/audit trực tiếp để chữa sự cố.
- Không chạy `infra:reset` khi đang trỏ nhầm production context.
- Không restore đè production mà chưa diễn tập trên DB tách biệt.
- Không downgrade schema bằng cách sửa migration lịch sử.

---

## 8. Deploy production và mức sẵn sàng thật

Repo có Kustomize base + overlays staging/production và image cho core-api/signaling; đây là
scaffold, không có nghĩa hệ thống đã sẵn sàng public launch.

### Gate trước production

- Image phải pin theo git SHA, quét dependency/image/secret và qua full test.
- K8s secret phải đến từ secret manager, không còn `REPLACE_ME` ở rendered manifest.
- Domain, TLS/cert-manager, CORS origin và cookie `Secure` phải đúng.
- Database backup/PITR + restore drill phải có bằng chứng.
- Real SMS provider chưa có trong code hiện tại: `DevSmsProvider` cố ý làm production bootstrap
  fail. Phải cắm provider thật và test delivery/rate-limit trước launch.
- IAP/refund Apple/Google cần credential và test sandbox/store thật; dev verifier không được bật.
- Push notification production cần provider/credential thật nếu feature yêu cầu.
- LiveKit key trong config phải sinh từ secret pipeline, khớp core-api; không commit file đã điền.
- Media multi-node/Party Room cap chỉ thay sau load test profile production.
- K8s TLS và secret-management tool vẫn là điểm mở trong tài liệu hiện hành.
- Multi-region/Cloudflare region B mới là scaffold, chưa provision.
- Admin granular permission chưa có; moderator hiện có blast radius lớn như admin endpoints.
- Swagger production phải tắt/bảo vệ; log phải redaction PII/secret.

### Trình tự release an toàn

```text
PR + review-module verify PASS
-> ci:preflight PASS
-> build image theo commit SHA
-> scan/sign image
-> backup/snapshot + migration compatibility review
-> deploy staging
-> smoke auth/readiness/admin read-only/economy invariant
-> phê duyệt production
-> deploy canary/rolling theo hạ tầng thật
-> theo dõi error, latency, readiness, queue, ledger reconciliation
-> rollback image nếu app lỗi; không rollback dữ liệu mù quáng
```

Khi thay schema, ưu tiên migration additive/expand-contract để version cũ và mới cùng chạy trong
rolling deployment. Rollback application không tự động rollback database.

---

## 9. Quan sát, audit và xử lý sự cố

### Nguồn bằng chứng

- Container/app logs có request ID/trace ID.
- `admin_audit_logs` cho hành động nhạy cảm AdminModule.
- `transactions` + `ledger_entries` cho tiền.
- `refresh_tokens` cho family/rotation/reuse/revocation.
- Report/block tables cho Trust & Safety.
- Health/readiness cho dependency state.
- Prometheus alert/loadtest config trong `k8s/` và `loadtest/`; không tin ngưỡng chưa benchmark.

### Thứ tự triage

1. Xác định scope: user, admin, region, module, thời điểm, trace ID.
2. Chặn lan rộng: disable credential/role/traffic path nhỏ nhất có thể.
3. Giữ bằng chứng: snapshot DB/log, commit SHA, manifest, secret version — không sửa lịch sử.
4. Kiểm tra consistency theo domain, đặc biệt ledger và state machine.
5. Khôi phục bằng API/service chuẩn hoặc reversal; tránh SQL sửa dữ liệu nghiệp vụ tùy tiện.
6. Viết postmortem: root cause, detection gap, blast radius, test/guard mới.

### Sự cố phổ biến local

| Triệu chứng                     | Kiểm tra                                                                        |
| ------------------------------- | ------------------------------------------------------------------------------- |
| Port bận/Nx lock                | Process/container cũ; `pnpm dev:ps`, log app                                    |
| `ENOSPC` watcher                | Compose dev đã bật polling; không dùng lệnh host cũ nếu watcher limit thấp      |
| Admin vào được UI nhưng API 403 | JWT không có `admin/moderator`; logout/login, kiểm tra DB role                  |
| Không thấy OTP                  | Gửi lại một lần, xem `core-api` log; kiểm tra rate limit 5/số/giờ               |
| OTP sai sau khi gửi lại         | Chỉ mã mới nhất hợp lệ                                                          |
| Web mất session sau reload      | Kiểm tra cookie/CORS/credentials/CSRF; không đưa refresh token vào localStorage |
| LiveKit connect fail            | URL public khác control URL nội bộ; kiểm tra Redis/key/port UDP                 |
| Migration không chạy            | Xem service `migrate`, `pnpm db:status`, không bỏ qua lỗi                       |
| Dữ liệu UI cũ sau reconnect     | Invalidate/refetch REST, kiểm tra cleanup socket listener                       |

---

## 10. Checklist chủ dự án theo chu kỳ

### Mỗi ngày phát triển

- `pnpm dev:ps`, kiểm tra readiness.
- Xem diff/worktree trước khi sửa.
- Nạp đúng context/AGENTS cho scope.
- Không gửi OTP/token/secret trong ảnh/log hỗ trợ.

### Trước mỗi PR/release

- Contract, migration, docs và env/deployment đồng bộ.
- Test happy path + invalid input + retry/race/authorization.
- `pnpm agent:check` và gate áp dụng PASS.
- `review-module verify` PASS.
- Security scan không có secret mới.
- Có rollback/forward-fix và tiêu chí quan sát.

### Hàng tuần/tháng khi đã vận hành thật

- Review admin/staff list, thu hồi tài khoản không còn nhu cầu.
- Review admin audit, refresh reuse, report abuse, ledger reconciliation.
- Kiểm tra backup và restore drill theo lịch.
- Patch dependency/image theo đánh giá rủi ro; không nâng mù quáng.
- Đối chiếu env schema với K8s ConfigMap/Secret.
- Load/capacity review dựa trên metric thật, không dựa con số marketing.
- Diễn tập incident: admin compromise, JWT rotation, DB restore, LiveKit outage.

---

## 11. Những điểm owner phải coi là “chưa xong”

1. SMS production provider chưa được cắm; OTP production chưa sẵn sàng.
2. `/permissions` và `/config` Admin đang demo, không phải backend quản trị thật.
3. Role phẳng; `moderator` hiện được phép qua toàn bộ AdminController.
4. Việc cấp/hạ role bằng DB chưa tự ghi admin audit.
5. Access JWT stateless có cửa sổ quyền cũ tối đa TTL sau khi hạ role/ban.
6. IAP/refund/push cần credential/provider thật và bằng chứng sandbox trước production.
7. K8s secret manager và TLS/cert-manager chưa chốt hoàn toàn.
8. Multi-region là scaffold, chưa có cluster/domain/load balancer thật.
9. Capacity LiveKit/Party Room chưa được phép nới nếu thiếu benchmark production.
10. Tài liệu/roadmap có thể chậm hơn code; khi lệch phải sửa nguồn canonical trong cùng thay đổi.

---

## 12. Kiểm thử chống bypass — góc nhìn attacker, dùng cho phòng thủ

> Mục này không phải cẩm nang khai thác. Không ghi payload né bảo mật, cách đánh cắp credential,
> chuỗi chiếm quyền, persistence, phá dữ liệu hoặc gây từ chối dịch vụ. Mục tiêu là giúp owner
> chứng minh từng lớp kiểm soát vẫn chặn đúng khi client không đi theo UI. Chỉ chạy trên local
> hoặc staging cô lập, bằng tài khoản/dữ liệu test và trong khung thời gian đã phê duyệt.

Không có danh sách nào chứng minh “không thể bypass tất cả”. Cách đúng là quản lý theo attack
surface, invariant và test hồi quy: phát hiện bề mặt mới thì thêm test + chốt backend + telemetry,
không chỉ thêm hướng dẫn thủ công vào file này.

### 12.1 Mục tiêu và nguyên tắc kiểm thử

Mỗi ca kiểm thử phải trả lời đủ năm câu:

1. Boundary nào bị thử: HTTP, WebSocket, LiveKit, webhook, DB, CI/CD hay trình duyệt?
2. Identity nào thực hiện: anonymous, guest, user A, user B, moderator, admin hay provider?
3. Hành động nào phải bị từ chối hoặc trở thành idempotent?
4. Chốt thật nằm ở file/service/constraint nào, không tính nút ẩn ở frontend?
5. Bằng chứng gồm status/error code, trace ID, DB before/after và audit/metric nào?

Quy tắc chạy:

- Không thử trên production hoặc dữ liệu người dùng thật.
- Snapshot DB trước test stateful; dùng ID/receipt/idempotency key dành riêng cho test.
- Không log access token, refresh cookie, OTP, API key, private key hoặc raw PII.
- Giới hạn concurrency/rate; không stress/DoS ngoài loadtest plan được phê duyệt.
- Một ca PASS chỉ khi state DB sau test đúng, không chỉ vì UI hiện thông báo lỗi.
- Bypass phát hiện được là bug bảo mật: dừng release, giữ bằng chứng, sửa chốt server và thêm test.

### 12.2 Bộ identity test tối thiểu

Tạo bằng dữ liệu giả trong staging:

| Identity     | Dùng để chứng minh                                                   |
| ------------ | -------------------------------------------------------------------- |
| Anonymous    | Endpoint protected trả 401; public surface không lộ dữ liệu nhạy cảm |
| Guest        | Hạn chế guest nằm ở backend, tạo user mới không reset quota thiết bị |
| User A       | Chủ sở hữu resource và happy path                                    |
| User B       | IDOR/cross-user access bị chặn                                       |
| User banned  | Login/refresh bị chặn; ghi nhận cửa sổ JWT cũ                        |
| Moderator    | Quyền moderation theo policy đã chốt                                 |
| Admin        | Admin happy path và audit actor                                      |
| Provider giả | Webhook thiếu/sai chữ ký bị chặn trước side effect                   |

Không dùng tài khoản admin local owner làm tài khoản fuzz/test hàng loạt.

### 12.3 Bề mặt public hiện hành

`@Public()` chỉ bỏ yêu cầu JWT user, không đồng nghĩa payload được tin:

| Bề mặt                                     | Kiểm soát phải có                                                            | Lưu ý owner                                                       |
| ------------------------------------------ | ---------------------------------------------------------------------------- | ----------------------------------------------------------------- |
| `/api/v1/auth/*`                           | DTO validation, OTP/social verification, rate limit, CSRF cho refresh/logout | Guest/OTP/social là entrypoint public có chủ đích                 |
| `/health`, `/health/live`, `/health/ready` | Chỉ trả health tối thiểu                                                     | Không trả env, secret, query hoặc stack trace                     |
| `/metrics`                                 | Hiện public + skip throttle                                                  | Phải giới hạn bằng network/Ingress scrape policy trước production |
| Calling/Party LiveKit webhook              | Verify chữ ký trên raw body trước xử lý                                      | Sai/thiếu chữ ký phải 401, không side effect                      |
| Apple/Google economy webhook               | Verify provider + app/audience/bundle trước xử lý                            | Dev verifier không được phép ở production                         |

CORS không phải authentication. Một non-browser client không bị CORS cản; mọi authorization,
ownership, rate limit và validation vẫn phải nằm ở backend.

### 12.4 Ma trận Auth, session và RBAC

| Ca chống bypass                          | Expected result                 | Bằng chứng                                                 |
| ---------------------------------------- | ------------------------------- | ---------------------------------------------------------- |
| Gọi endpoint protected không Bearer      | 401                             | `COMMON_UNAUTHORIZED` + trace ID                           |
| Bearer hỏng, hết hạn hoặc bị sửa         | 401                             | Không gắn `req.user`, không DB mutation                    |
| Token role `user` gọi `/admin/*`         | 403                             | `COMMON_FORBIDDEN`, no audit mutation                      |
| Thiếu refresh cookie                     | 401                             | `AUTH_REFRESH_TOKEN_INVALID`                               |
| Thiếu/sai CSRF header khi refresh/logout | 401                             | `COMMON_CSRF_TOKEN_INVALID`                                |
| Dùng lại refresh token đã rotate         | 401 và revoke family            | `AUTH_REFRESH_TOKEN_REUSED`, family bị revoked             |
| OTP sai/đã hết hạn/đã consume            | 400/429 theo domain             | attempt tăng atomic, không issue session                   |
| Xin OTP vượt IP hoặc số điện thoại       | 429                             | `COMMON_RATE_LIMITED` hoặc `AUTH_OTP_REQUEST_RATE_LIMITED` |
| Login user banned                        | 403                             | `AUTH_USER_BANNED`, không issue token mới                  |
| Hạ role rồi refresh                      | Token mới mang role DB hiện tại | Decode test token, API admin bị 403                        |

Ca read-only tối thiểu không token:

```bash
curl -i 'http://localhost:3000/api/v1/admin/users?limit=1&offset=0'
```

Expected: `401`; không dùng command này để suy ra cấu trúc dữ liệu từ lỗi.

Điểm cần hiểu đúng: access JWT là stateless. Hạ role hoặc ban user không làm access token đã phát
mất hiệu lực ngay; quyền cũ có thể tồn tại tới hết `JWT_ACCESS_TTL_SECONDS` (mặc định 900 giây).
Đây là cửa sổ rủi ro đã biết, không được ghi nhận nhầm là “revoke tức thời”. Incident cần cắt ngay
phải dùng quy trình rotate JWT đồng bộ đã ghi ở mục 3.

### 12.5 Ma trận ownership/IDOR và privacy

Với từng resource có ID do client gửi, chạy cặp test A sở hữu/B không sở hữu:

| Nhóm resource        | User B không được phép                          | Expected                                 |
| -------------------- | ----------------------------------------------- | ---------------------------------------- |
| Profile/private data | Đọc/sửa trường riêng của A                      | 403 hoặc 404 oracle-safe theo contract   |
| Wallet/transaction   | Xem hoặc tác động ví A                          | 403/404; balance/ledger không đổi        |
| Post/story/video     | Sửa/xoá nội dung A hoặc xem audience bị cấm     | 403/404; không lộ existence nhạy cảm     |
| Match/call/session   | Confirm/end/join session không phải participant | 403/404; state không đổi                 |
| Friend/chat          | Đọc/gửi vào conversation không thuộc cặp        | 403/404; không message/event             |
| Party room           | Thực hiện quyền host/speaker khi chỉ audience   | Domain error; LiveKit grant không đổi    |
| Notification/report  | Đọc notification hoặc sửa report không có quyền | 403/404                                  |
| Nearby               | Suy ra tọa độ/khoảng cách chính xác             | API chỉ trả bucket; không raw coordinate |

Kiểm tra cả list, detail, mutation, download/upload URL và realtime event. Việc list đã lọc đúng
không chứng minh detail endpoint cũng đúng. Với block/report/audience, đổi trạng thái giữa hai
bước rồi gọi lại để chứng minh server re-check tại đúng thời điểm.

### 12.6 Ma trận workflow/state machine

Không giả định client gọi A → B → C đúng thứ tự. Cho mỗi flow nhiều bước, test có kiểm soát:

- Gọi bước sau khi thiếu bước trước: server từ chối transition.
- Gọi lại cùng bước: trả cùng kết quả idempotent hoặc lỗi domain ổn định, không nhân side effect.
- Gọi bằng ID cũ/đã kết thúc: không hồi sinh state.
- Hai request đồng thời: constraint/conditional update/lock cho đúng một kết quả hợp lệ.
- Logout/login hoặc reconnect giữa flow: server đọc state thật, không tin state frontend cũ.
- Block/ban/hết VIP/hết balance phát sinh giữa flow: re-check tại thời điểm hành động.

Flow bắt buộc có test riêng: matching queue/confirm, Soul rating/friendship, calling billing,
Party role, gift, IAP/refund, story reply, video moderation và match invite.

### 12.7 Ma trận Economy/diamond

Đây là nhóm P0, chỉ PASS khi đối chiếu DB thật:

| Ca chống gian lận                     | Bất biến phải giữ                                           |
| ------------------------------------- | ----------------------------------------------------------- |
| Client gửi giá/balance/VIP/role giả   | Server bỏ qua và tự đọc catalog/state DB                    |
| Retry cùng idempotency key            | Một `Transaction`, cùng kết quả cũ, không thêm ledger       |
| Cùng key nhưng payload khác           | Conflict/domain error, không tái sử dụng kết quả sai        |
| N spend song song                     | Không lost update, không chi vượt snapshot hợp lệ           |
| Gift song song/retry                  | Mỗi intent đúng một event; DIA và PTS mỗi chân tự cân       |
| Refund sau khi đã tiêu                | Reversal append-only; balance có thể âm theo rule           |
| Admin refund lặp                      | Không reverse hai lần; có actor/reason/audit                |
| Receipt/provider payload không hợp lệ | Không credit/refund, trả lỗi hoặc ack an toàn theo contract |

Sau mỗi ca: assert tổng Nợ = tổng Có theo currency, `Wallet.balance` khớp derived ledger theo
contract, transaction/receipt/idempotency unique đúng và không có update/delete ledger/audit.

### 12.8 Realtime, Socket.IO và LiveKit

- Socket thiếu/sai/hết hạn JWT không được subscribe channel user.
- User A không nhận event riêng của B; room broadcast chỉ tới member hợp lệ.
- Reconnect không dùng lại membership/token đã hết quyền mà không re-check.
- LiveKit token TTL ngắn, room/identity/grant đúng server state; client không tự nâng grant.
- Audience không tự unmute/thành speaker; chỉ host action hợp lệ mới đổi state và SFU grant.
- Webhook giả/thiếu chữ ký không thay call/room state.
- Event duplicate/out-of-order không nhân side effect; REST refetch phục hồi state sau reconnect.
- Log/metric không chứa media token, JWT, API secret hoặc nội dung riêng tư.

### 12.9 Input, upload, browser và API contract

- DTO reject unknown/sai type/quá dài/format sai theo contract; lỗi không trả stack/SQL/secret.
- URL/resource input phải theo allow-list và không biến server thành proxy tùy ý.
- Upload URL gắn owner/object/TTL; MIME, size và lifecycle được kiểm tra ở provider thật.
- HTML/text do user nhập phải render an toàn; không đưa raw user input vào HTML/script/log format.
- Cookie production phải `Secure`, `HttpOnly`, `SameSite=Strict`, path hẹp.
- CORS allow-list là origin thuần; không wildcard với credential.
- Frontend route guard, disabled button và local validation không được tính là security control.
- OpenAPI/client generated phải khớp runtime envelope; API lỗi có code + trace ID ổn định.

### 12.10 Infra, supply chain và operational bypass

| Kiểm tra                   | Expected                                                                         |
| -------------------------- | -------------------------------------------------------------------------------- |
| Render K8s manifest        | Không còn `REPLACE_ME`, không secret plaintext trong Git/artifact                |
| Image deploy               | Pin commit SHA/digest, scan/sign theo pipeline                                   |
| Swagger/metrics production | Tắt hoặc giới hạn network/auth phù hợp                                           |
| DB/Redis/LiveKit           | Không public ngoài boundary cần thiết, credential riêng từng env                 |
| Migration                  | Không `synchronize`, không sửa migration đã chạy, có compatibility/rollback plan |
| CI protected branch        | Required checks không bị bỏ qua bởi push trực tiếp trái policy                   |
| Log/backup/dump            | Mã hoá, retention, least privilege, không public link                            |
| Admin/cluster access       | MFA/least privilege, không dùng chung account, review định kỳ                    |

Secret bị lộ thì scan pass sau khi xóa file là chưa đủ: secret đã vào history/artifact phải rotate,
thu hồi, điều tra access và làm sạch theo quy trình incident.

### 12.11 Known gaps phải biến thành security backlog

| Gap hiện tại                                      | Rủi ro                                       | Chốt cần làm trước production                                                       |
| ------------------------------------------------- | -------------------------------------------- | ----------------------------------------------------------------------------------- |
| Moderator qua toàn bộ AdminController             | Blast radius ngang admin endpoint            | Capability/granular RBAC + test từng route                                          |
| Role change bằng DB không vào admin audit         | Thiếu attribution                            | Ops audit bắt buộc hoặc endpoint cấp quyền kiểm soát chặt                           |
| JWT stateless giữ role/status cũ tới TTL          | Thu hồi không tức thời                       | TTL ngắn + emergency rotation; cân nhắc token version/denylist nếu threat model cần |
| CSRF guard gắn thủ công cho cookie route          | Route cookie mới có thể quên guard           | Review/guard test tự động cho mọi cookie-auth mutation                              |
| `/metrics` public, skip throttle                  | Lộ telemetry/topology nếu ingress public     | Chỉ cho Prometheus/network nội bộ scrape                                            |
| SMS/video storage/transcode/push còn dev provider | Không thể vận hành production an toàn/đầy đủ | Provider thật, fail-closed, integration test                                        |
| Admin `/permissions` và `/config` là demo         | Dễ tưởng thay đổi đã persist/enforce         | Backend contract thật hoặc tiếp tục dán nhãn demo rõ                                |
| TLS/secret manager còn điểm mở                    | Credential/traffic risk                      | Chốt ADR/tooling và diễn tập rotation                                               |

Mỗi gap phải có owner, severity, deadline, acceptance test và bằng chứng đóng. Không đổi nhãn UI
thành “đã an toàn” khi backend chưa có chốt.

### 12.12 Mẫu biên bản kiểm thử

```text
Test ID:
Environment / commit SHA:
Scope / approval:
Identity A / B (test IDs, không ghi token):
Precondition:
Action category (không chép exploit secret/payload vào ticket công khai):
Expected status + domain code:
Actual status + domain code:
Trace ID / audit ID:
DB before/after invariant:
Verdict: PASS / FAIL
Severity nếu FAIL:
Owner + remediation + regression test:
```

Release security gate FAIL nếu có một trong các trường hợp: anonymous/user lấy được quyền admin,
IDOR lộ dữ liệu riêng, webhook giả tạo side effect, client quyết định giá/role, double-spend,
ledger mất cân, secret xuất hiện trong artifact/log hoặc provider dev lọt vào production.

---

## 13. Bản đồ nguyên lý theo từng thành phần và phần còn thiếu

Chương này trả lời bốn câu hỏi cho từng phần của hệ thống: nó được xây theo nguyên lý nào, chốt
ở đâu, giới hạn hiện tại là gì và nguyên tắc nào còn thiếu. Ngày đối chiếu: **2026-07-15**.

### 13.1 Thứ tự ưu tiên khi các nguyên lý xung đột

Áp dụng thứ tự này cho mọi quyết định kỹ thuật và sản phẩm:

1. **Correctness và security**: dữ liệu đúng, không mất tiền/quyền riêng tư, không cấp quyền sai.
2. **Domain ownership và boundary**: nơi sở hữu nghiệp vụ là nơi duy nhất quyết định và ghi dữ
   liệu của nghiệp vụ đó.
3. **Contract tường minh**: HTTP, event, module API, schema DB và config đều phải có hợp đồng rõ.
4. **KISS/YAGNI**: chọn cách đơn giản nhất đáp ứng đúng nhu cầu hiện tại; không xây để “có thể cần”.
5. **Khả năng mở rộng codebase và đội ngũ**: module rõ, dependency một chiều, thay đổi cô lập.
6. **Hiệu năng runtime**: chỉ tối ưu/tách/scale sau khi có metric, benchmark hoặc sự cố chứng minh.

Không được lấy performance, deadline, giao diện đẹp hoặc tiện cho frontend làm lý do phá correctness,
security hay invariant dữ liệu. Nếu hai nguồn quy tắc mâu thuẫn, thứ tự quyền lực là: `AGENTS.md` →
architecture/ADR → coding standards → `AGENTS.md` gần module → roadmap → file owner này.

### 13.2 Trạng thái dùng trong chương này

| Nhãn       | Nghĩa                                                                                   |
| ---------- | --------------------------------------------------------------------------------------- |
| `ENFORCED` | Đã có chốt trong DB/code/guard/CI và có test hoặc bằng chứng chạy được.                 |
| `PARTIAL`  | Có thiết kế hoặc một phần chốt, nhưng còn đường hở, phụ thuộc manual hoặc môi trường.   |
| `MISSING`  | Chưa có bảo đảm đủ. Đây là backlog đề xuất, **không được mô tả là hệ thống đã hỗ trợ**. |

Một nguyên lý chỉ trở thành luật dự án sau khi có đủ: nguồn canonical, owner, vị trí enforcement,
negative test và positive test. Viết nó trong file private này không tự biến nó thành luật đã áp dụng.

### 13.3 Nguyên lý nền áp dụng cho mọi thành phần

- **Server/DB là nguồn sự thật**; client, cache, socket và metric chỉ là view/projection.
- **Deny-by-default**; validate tại boundary, kiểm tra authentication, authorization, ownership và
  trạng thái nghiệp vụ tại server ở đúng thời điểm hành động.
- **Không tin input quyết định giá trị** như role, giá, balance, VIP, thời lượng, owner, audience,
  LiveKit grant hoặc trạng thái workflow do client gửi.
- **Atomic và idempotent** cho side effect; retry không được nhân đôi tiền, event hay tài nguyên.
- **Single writer** cho invariant quan trọng; module khác gọi public API, không ghi xuyên bảng.
- **Failure phải hữu hạn và quan sát được**: timeout, retry có giới hạn, trạng thái lỗi, trace/audit.
- **Không log secret/PII**; dữ liệu thu thập tối thiểu và quyền đọc tối thiểu.
- **Backward compatible và có đường lùi/tiến** cho API, event, DB, config và deployment.
- **Test behavior/invariant**; coverage chỉ là tín hiệu, không phải bằng chứng correctness.
- **Không lách guard**; nếu chốt cản thay đổi thì sửa thiết kế hoặc cập nhật quyết định canonical.

### 13.4 Governance, tài liệu và cấu trúc repository — `ENFORCED/PARTIAL`

**Đang áp dụng**

- Repository là Nx monorepo; source canonical và thứ tự quyền lực tài liệu được quy định rõ.
- ADR ghi lịch sử quyết định theo kiểu append-only: quyết định mới thay quyết định cũ bằng ADR mới.
- Backend chỉ có ba deployable: `core-api`, `signaling-gateway`, `media-server`. Domain mới mặc định
  là module trong `core-api`, không tự tạo service thứ tư.
- `common/` và `libs/` phải trung lập; dependency một chiều, app không import app khác.
- Quyết định tách service phải có số liệu, ADR, data boundary, migration và rollback plan.

**Chốt hiện có**: `AGENTS.md`, `docs/03`, `docs/11`, `docs/14`, Nx tags, module-boundary test,
`guard-core`, link checker và workflow policy.

**Còn thiếu phải bổ sung**

- `MISSING`: mỗi exception/waiver cần owner, lý do, phạm vi, ngày hết hạn và test chứng minh nó không
  lan rộng. Hiện exception như LiveKit `hostNetwork` có ghi ADR nhưng chưa có registry chung.
- `MISSING`: CODEOWNERS/approval policy theo domain nhạy cảm cần được chứng minh trên nền Git host,
  không chỉ dựa vào checklist local.
- `MISSING`: mỗi invariant canonical mới phải buộc cập nhật `docs/14` bằng CI, tránh rule có trong
  prose nhưng không ai biết được enforce ở đâu.

### 13.5 `core-api` và các module nghiệp vụ — `ENFORCED/PARTIAL`

**Đang áp dụng**

- Modular monolith giữ toàn bộ business logic; controller mỏng, domain service sở hữu quyết định.
- DTO validation global dùng whitelist + reject field lạ; response thành công/error có envelope và
  error code/trace ID ổn định.
- PostgreSQL là nguồn sự thật; schema chỉ đổi bằng migration, `synchronize=false`.
- Global chain hiện có throttling → JWT auth → RBAC; public route phải opt-out tường minh.
- Config typed/validated lúc boot; app fail sớm khi cấu hình sai.

**Chốt hiện có**: Nest global guard/pipe/filter/interceptor, module-boundary spec, Joi env schema,
OpenAPI emit/check và integration tests theo module.

**Còn thiếu phải bổ sung**

- `MISSING P0`: throttling hiện dùng memory của từng process. Khi có nhiều replica, quota không
  toàn cục và reset khi restart; phải dùng distributed storage phù hợp hoặc rate limit tại edge,
  đồng thời test race/multi-replica.
- `MISSING P1`: quy định timeout/circuit breaker/retry budget chung cho mọi HTTP/provider call.
  Hiện nguyên lý failure isolation đã có nhưng enforcement chưa bao phủ tự động mọi adapter.
- `MISSING P1`: mỗi module cần bảng data owner/read/write contract máy kiểm được; boundary import
  đã được chặn nhưng việc cùng DB vẫn còn dựa một phần vào review để ngăn ghi xuyên bảng.

### 13.6 Authentication, OTP, session và cookie — `ENFORCED/PARTIAL`

**Đang áp dụng**

- Đăng nhập bằng OTP TTL ngắn, giới hạn attempt/request, mã được bảo vệ khi lưu; mã cũ/đã dùng
  không cấp session lại.
- Access token sống trong memory frontend; refresh token chỉ ở cookie `HttpOnly`; CSRF dùng
  double-submit token cho refresh/logout.
- Refresh token được hash trong DB, rotate theo lần dùng, phát hiện reuse và revoke token family.
- Cookie production dùng thuộc tính an toàn; CORS là allow-list, không wildcard với credential.
- Role/status lấy từ server lúc phát token mới; frontend không có quyền tự nâng role.

**Chốt hiện có**: OTP service/tests, auth session DB, JWT/refresh service, `CsrfGuard`, cookie tests,
browser auth E2E và production fail-closed của `DevSmsProvider`.

**Còn thiếu phải bổ sung**

- `MISSING P0`: access JWT stateless vẫn giữ role/status cũ tới hết TTL (mặc định 900 giây). Cần
  token/session version hoặc denylist cho thu hồi khẩn cấp; test ban/hạ quyền trên token đang sống.
- `MISSING P0`: route cookie-auth mới có thể quên gắn `CsrfGuard`; cần test/metadata policy tự động
  buộc mọi mutation đọc credential từ cookie đều có CSRF.
- `MISSING P0`: production phải có SMS provider thật, anti-abuse theo IP/phone/device/ASN ở edge và
  quy trình chống SIM-swap/account recovery. Provider dev đã fail-closed nhưng provider thật chưa có.
- `MISSING P1`: tài khoản staff cần MFA mạnh hơn OTP SMS và re-authentication cho thao tác cực nhạy
  cảm; không dùng chung identity giữa người vận hành.

### 13.7 Admin, RBAC và audit — `PARTIAL`

**Đang áp dụng**

- Backend mới là chốt quyền; Admin SPA chỉ là giao diện. Route guard phía client không được tính là
  security control.
- `AdminController` yêu cầu role `admin` hoặc `moderator` ở class level; mutation nhạy cảm hiện có
  audit actor/reason ở service tương ứng.
- Không tự ban chính mình; refund/reversal đi qua Economy thay vì sửa balance/ledger trực tiếp.

**Còn thiếu phải bổ sung**

- `MISSING P0`: moderator hiện qua được toàn bộ controller giống admin. Phải chuyển sang capability
  granular theo route/action/resource và áp least privilege/separation of duties.
- `MISSING P0`: cấp/hạ role trực tiếp bằng DB không tạo admin audit. Cần workflow cấp quyền chính
  thức, actor + reason + approval, audit append-only và cảnh báo thay đổi đặc quyền.
- `MISSING P0`: thao tác như cấp quyền, refund lớn, export dữ liệu, đổi config cần step-up auth;
  ngưỡng lớn nên dùng four-eyes approval, không một người tự yêu cầu và tự duyệt.
- `MISSING P1`: audit cần retention, integrity check, export về hệ thống tách biệt và alert hành vi
  bất thường; log ứng dụng đơn lẻ không đủ chống người có quyền cao sửa dấu vết.
- `PARTIAL`: `/permissions` và `/config` trên Admin là demo; không được quảng bá là đã persist hoặc
  enforce cho tới khi có backend contract và audit thật.

### 13.8 User, profile, privacy và vòng đời dữ liệu — `PARTIAL`

**Đang áp dụng**

- Server kiểm ownership/visibility; DTO public không được lộ field nội bộ như phone, role, status,
  tọa độ thô hoặc token.
- Block/report/audience phải được re-check tại thời điểm đọc/hành động; privacy không dựa vào việc
  client ẩn nút.
- Dữ liệu Nearby lưu tọa độ đã lượng tử hoá và xoá khi opt-out; không trả raw coordinate.

**Còn thiếu phải bổ sung**

- `MISSING P0`: cần data classification và inventory: public/internal/confidential/restricted cho
  từng field/bảng/event/log/backup, kèm owner và consumer hợp lệ.
- `MISSING P0`: cần policy retention/deletion cho account, OTP/session, chat, report/evidence, media,
  location, audit, log và backup; hiện mới có lifecycle riêng cho story/video ticket.
- `MISSING P0`: cần luồng đóng tài khoản, download/export dữ liệu, xoá/anonymize, legal hold và bằng
  chứng propagation tới cache, object storage, search, event consumer và backup theo luật áp dụng.
- `MISSING P1`: consent phải có version/timestamp/purpose và lịch sử rút consent cho dữ liệu vị trí,
  marketing, analytics và tính năng có nội dung nhạy cảm.

### 13.9 Economy, diamond, gift, IAP và refund — `ENFORCED/PARTIAL`

**Đang áp dụng**

- `LedgerService` là writer duy nhất. Ledger double-entry append-only là nguồn sự thật; wallet chỉ
  là snapshot. Không sửa/xoá bút toán cũ; sửa sai bằng reversal/adjustment có actor.
- Transaction có idempotency key unique ở DB và request hash; cùng key khác payload bị từ chối.
- Ghi transaction, entries, wallet, side effect và outbox trong cùng DB transaction; lock ví theo
  thứ tự ổn định để chống race/deadlock.
- Giá/catalog/receipt do server/provider quyết định; client không được gửi balance hay giá đáng tin.
- Gift tách DIA và PTS đúng currency/account; retry/race phải giữ cân bằng từng currency.

**Chốt hiện có**: unique/check/append-only DB trigger, guard scan mutation, integration/property/
chaos tests, reconciliation metrics/job, outbox relay và store verifier ports.

**Còn thiếu phải bổ sung**

- `MISSING P0`: bằng chứng sandbox/production thật cho Apple/Google webhook, receipt, refund và
  credential rotation; dev verifier chỉ là scaffold dù đã bị chặn ở production.
- `MISSING P0`: alert tài chính phải có ngưỡng/owner/runbook cho ledger imbalance, reconciliation
  drift, refund spike, idempotency conflict và negative balance bất thường.
- `MISSING P1`: quy trình close-of-day, dispute/chargeback, revenue recognition, manual adjustment
  approval và export đối soát độc lập khỏi người vận hành ứng dụng.
- `MISSING P1`: fraud/risk engine theo velocity/device/provider cần threat model riêng; không chặn
  gian lận chỉ bằng global throttle.

### 13.10 Matching, Soul/Voice/Movie/Palm/Mini-game — `ENFORCED/PARTIAL`

**Đang áp dụng**

- Một user chỉ có một queue/ticket hợp lệ; matching worker dùng atomic lock/claim, không để hai
  worker lấy cùng ticket.
- Filter block, age, status và eligibility được server re-check tại thời điểm ghép/accept.
- Workflow nhiều bước là state machine; client không được nhảy bước, hồi sinh session cũ hoặc tự
  xác nhận partner.
- Speed-up/trả phí gọi Economy qua public API và idempotency, không chạm wallet trực tiếp.
- Redis là projection/coordination; state bền vững quan trọng vẫn về PostgreSQL.

**Còn thiếu phải bổ sung**

- `MISSING P1`: SLO queue wait/match success/false-positive block và fairness theo cohort phải có
  dashboard + threshold thật; chưa được tối ưu thuật toán bằng cảm giác.
- `MISSING P1`: policy chống collusion, bot, repeated-pair manipulation và ranking bias cần metric,
  audit reason và appeal, không dùng rule bí mật không đo được.
- `MISSING P1`: state machine contract cần property/concurrency tests nhất quán cho mọi mini-flow,
  không chỉ các domain nhạy cảm đã có integration test sâu.

### 13.11 Calling và Party Room — `ENFORCED/PARTIAL`

**Đang áp dụng**

- Core API sở hữu session, participant, billing và role; LiveKit chỉ vận chuyển media.
- LiveKit token được mint server-side, TTL ngắn, gắn room/identity/grant từ state thật.
- Host/speaker/audience là state machine server-side; audience không tự nâng quyền mic.
- Webhook phải xác thực chữ ký trên raw body; duplicate/out-of-order không được nhân side effect.
- Billing theo phút/extend call đi qua ledger atomic/idempotent; disconnect/reconnect không tự miễn
  hoặc nhân phí ngoài contract.

**Còn thiếu phải bổ sung**

- `MISSING P0`: benchmark thật theo publishers/subscribers/codec/bitrate và room size; một room phải
  vừa một node, không được giả định thêm replica sẽ chia nhỏ room.
- `MISSING P0`: xác nhận TURN/NAT/firewall/TLS, webhook reachability và media quality trên thiết bị/
  mạng thật trước public launch.
- `MISSING P1`: reconnect token phải re-check ban/block/role/session version; socket/media đang sống
  cần chiến lược revoke khi quyền bị thu hồi giữa phiên.
- `MISSING P1`: deploy/drain/evacuate room và incident runbook cần rõ; media hiện `Recreate` một
  replica nên chấp nhận downtime ngắn, chưa phải zero-downtime.

### 13.12 Feed, Story, Short Video và Safety — `ENFORCED/PARTIAL`

**Đang áp dụng**

- Author/owner/audience/block quyết định quyền đọc/ghi; counter update phải atomic, không lấy số
  client gửi làm sự thật.
- Story hết hạn được filter ngay trên read-path; sweeper chỉ dọn rác, không phải chốt privacy.
- Video có state upload → processing → review/published/failed và moderation mode từ config.
- Report/block/trust score là server-side; nội dung bị report vượt rule có thể bị ẩn theo contract.

**Còn thiếu phải bổ sung**

- `MISSING P0`: storage/transcode video production còn là dev provider; cần vendor ADR, signed
  upload, MIME/size validation, malware/content scan, webhook signature và object lifecycle.
- `MISSING P0`: moderation policy cần severity, SLA, evidence retention, appeal, repeat offender,
  emergency takedown và quyền xem nội dung nhạy cảm theo least privilege.
- `MISSING P1`: copyright/consent, media deletion propagation, hash matching và policy nội dung trẻ
  vị thành niên phải được chốt theo thị trường trước khi mở upload công khai.
- `MISSING P1`: ranking/feed cần explanation metric và anti-abuse; không để engagement tối ưu lấn át
  safety/privacy hoặc tạo amplification không quan sát được.

### 13.13 Discovery, Nearby và Mood — `ENFORCED/PARTIAL`

**Đang áp dụng**

- Discovery chỉ trả field public theo visibility/block/status. Nearby là opt-in, dùng vị trí lượng
  tử hoá/bucket; tắt phải xoá record vị trí trong cùng transaction.
- Vị trí là dữ liệu privacy cao; không log raw coordinate và không dùng client filter làm chốt.
- Mood dùng value/contract hữu hạn thay vì biến free-text chưa có moderation thành tín hiệu ghép.

**Còn thiếu phải bổ sung**

- `MISSING P0`: retention TTL tự động cho location kể cả khi client không opt-out; record cũ phải
  hết hiệu lực và được purge theo deadline.
- `MISSING P0`: chống suy luận vị trí qua nhiều truy vấn/bucket, rate limit theo identity và privacy
  review theo cohort/khu vực trước khi rollout.
- `MISSING P1`: feature flag/kill switch theo region cho Nearby, kèm metric an toàn và audit ai bật.

### 13.14 Notification và provider bên ngoài — `PARTIAL`

**Đang áp dụng**

- Module giữ notification bền vững trong DB; push provider là port có implementation chọn bằng env.
- Dev provider fail-closed ở production; dependency ngoài không được làm mất transaction nguồn.
- Notification payload không được mang secret/token/nội dung riêng tư quá mức cần thiết.

**Còn thiếu phải bổ sung**

- `MISSING P0`: FCM/APNs thật, credential rotation, device-token lifecycle, invalid-token cleanup và
  opt-out/quiet-hours chưa đủ bằng chứng production.
- `MISSING P1`: retry/backoff/DLQ/deduplication và delivery status phải có budget; push không được
  vừa “best effort” vừa âm thầm mất mà không metric.
- `MISSING P1`: template/version/localization và policy không lộ nội dung nhạy cảm trên lock screen.

### 13.15 PostgreSQL và migration — `ENFORCED/PARTIAL`

**Đang áp dụng**

- PostgreSQL là source of truth; constraint, unique, foreign key, check, lock và transaction bảo vệ
  invariant ở tầng cuối.
- Migration đã commit là bất biến; không sửa lịch sử, không dùng `synchronize`; thay đổi schema phải
  forward-compatible với phiên bản app cũ/mới trong lúc rolling deploy.
- Sensitive writer được cô lập trong domain service và có integration test DB thật.

**Còn thiếu phải bổ sung**

- `MISSING P0`: production cần backup/PITR, RPO/RTO định lượng, encryption, retention, off-site copy
  và restore drill định kỳ có bằng chứng; backup chưa restore thử không được tính là backup.
- `MISSING P0`: credential/role DB riêng theo workload, least privilege, TLS bắt buộc và audit truy
  cập đặc quyền. Một URL dùng quyền rộng cho mọi thao tác làm tăng blast radius.
- `MISSING P1`: migration lớn cần expand/migrate/contract, online index/backfill budget, canary và
  data verification query; không chỉ có câu lệnh rollback hình thức.

### 13.16 Redis — `PARTIAL`

**Đang áp dụng**

- Redis giữ cache, ephemeral coordination, matching lock và realtime pub/sub; không thay DB cho dữ
  liệu nghiệp vụ bền vững.
- Key cần namespace/TTL; mất cache phải degrade/rebuild được thay vì làm sai source of truth.
- Atomic operation/script/lock dùng cho race, không read-modify-write ngây thơ từ nhiều worker.

**Còn thiếu phải bổ sung**

- `MISSING P0`: Redis production cần auth/TLS/network isolation, persistence/failover policy và
  kiểm thử mất node; local public port không phải topology production.
- `MISSING P1`: key inventory + TTL ownership, memory budget/eviction policy và hot-key/cardinality
  alert cho từng module.
- `MISSING P1`: lock lease/fencing/recovery phải được chuẩn hoá và test clock/process crash.

### 13.17 Kafka, event và outbox — `ENFORCED/PARTIAL`

**Đang áp dụng**

- DB mutation + durable event dùng transactional outbox để tránh dual-write; relay dùng retry và
  publish sau commit.
- Event liên module là contract, có `version`; thêm field có thể tương thích, đổi/xoá field phải lên
  version mới.
- Consumer side effect phải idempotent; event ephemeral realtime có fallback REST có thể best-effort
  theo contract, không áp outbox máy móc.

**Còn thiếu phải bổ sung**

- `MISSING P1`: inbox/deduplication chuẩn, retry topic/DLQ, poison-message quarantine, replay runbook
  và retention/partition ownership chưa thành platform contract đồng nhất.
- `MISSING P1`: schema compatibility gate/registry và consumer-driven contract test cần được chốt;
  số `version` trong payload một mình không ngăn breaking change.
- `MISSING P1`: lag, unpublished outbox age, duplicate/replay rate phải có alert + owner.

### 13.18 Signaling Gateway — `ENFORCED/PARTIAL`

**Đang áp dụng**

- Gateway là connection-bound adapter, không chứa business logic. JWT được verify lúc handshake;
  socket chỉ join room `realtime:user:{userId}` của chính identity đã xác thực.
- CORS Socket.IO là allow-list; Redis adapter fan-out giữa replica; sticky cookie tại ingress hỗ trợ
  polling. REST vẫn là nguồn sự thật, socket chỉ phát delta.
- Có health/metrics, structured log/redaction và graceful shutdown.

**Còn thiếu phải bổ sung**

- `MISSING P0`: metric endpoint phải chỉ scrape nội bộ; không để route public lộ topology/traffic.
- `MISSING P1`: connection quota theo user/IP, max payload, backpressure, idle timeout và overload
  shedding cần benchmark/test nhiều replica.
- `MISSING P1`: strategy disconnect/re-auth khi token hết hạn, user bị ban hoặc quyền đổi giữa một
  kết nối dài; handshake đúng không chứng minh cả vòng đời socket đúng.

### 13.19 Media Server/LiveKit — `ENFORCED/PARTIAL`

**Đang áp dụng**

- Dùng image LiveKit chính thức pin digest; không có business logic Litmatch trong media server.
- `hostNetwork` là trade-off đã có ADR; pod non-root, seccomp, no privilege escalation, read-only
  root filesystem và drop all capabilities.
- Một room phải nằm trọn trên một node; replicas mặc định một, không HPA cho tới khi topology và
  benchmark cho phép. Redis chia sẻ giúp chọn node, không chia một room ra nhiều node.

**Còn thiếu phải bổ sung**

- `MISSING P0`: probe LiveKit, UDP range, TURN, public IP, TLS và webhook phải được kiểm chứng trên
  cluster/provider thật; manifest hiện chứa giả định chưa đủ bằng chứng vận hành.
- `MISSING P0`: capacity model, room admission/cap, node drain và multi-node placement phải dựa trên
  load test media thật, không dựa CPU request mặc định.
- `MISSING P1`: media quality metrics (join failure, RTT, jitter, packet loss, reconnect) và privacy
  policy recording/logging cần dashboard/runbook riêng.

### 13.20 API, DTO và shared contract — `ENFORCED/PARTIAL`

**Đang áp dụng**

- HTTP version trong URI `/api/v1`; OpenAPI runtime và spec emit dùng chung một builder.
- Frontend gọi REST qua generated `@litmatch/api-client`; guard cấm hand-written fetch/axios cho
  business API và CI kiểm OpenAPI drift.
- DTO ở boundary, response envelope và error code/trace ID là contract; entity nội bộ không đi qua
  module/client boundary.

**Còn thiếu phải bổ sung**

- `MISSING P1`: API lifecycle: thời gian support, deprecation header, migration guide, compatibility
  matrix và sunset policy cho mobile/non-browser client tương lai.
- `MISSING P1`: contract test từ consumer và production schema diff gate cho breaking change; codegen
  đúng type không tự chứng minh semantic behavior không đổi.
- `MISSING P1`: size/pagination/query-cost budgets thống nhất để ngăn endpoint hợp lệ nhưng gây DoS.

### 13.21 Website người dùng (`apps/web`) — `ENFORCED/PARTIAL`

**Đang áp dụng**

- UI là hàm của server state; không chứa business logic và không tự quyết quyền/giá/trạng thái.
- TanStack Query là source duy nhất cho server state; socket chỉ cập nhật delta và reconnect phải
  invalidate/refetch REST.
- API generated client, strict TypeScript, feature/shared boundary, route-based splitting và typed
  environment. Access token memory; refresh cookie HttpOnly.
- Component đã dùng nhiều semantic/ARIA state; loading/empty/error được biểu diễn tường minh.

**Còn thiếu phải bổ sung**

- `MISSING P0`: CSP hiện chưa thành chốt production chặt; cần threat model script/third-party,
  nonce/hash strategy phù hợp và security-header test, không dùng `unsafe-inline` để tạo cảm giác an toàn.
- `MISSING P1`: chọn chuẩn WCAG mục tiêu (khuyến nghị 2.2 AA), keyboard/focus/contrast/screen-reader
  checklist và axe/browser E2E gate; có ARIA rải rác chưa đồng nghĩa accessible.
- `MISSING P1`: performance budgets cho web route/Core Web Vitals, ảnh/video/data usage và thiết bị
  yếu; Admin có bundle budget không thay thế budget cho website người dùng.
- `MISSING P1`: browser/device support matrix, offline/slow-network/error recovery và XSS regression
  tests cho mọi user-generated content.

### 13.22 Admin SPA (`apps/admin`) — `ENFORCED/PARTIAL`

**Đang áp dụng**

- Cùng boundary frontend: generated API client, TanStack Query, typed env, strict TypeScript.
- App shell/route guard cải thiện UX nhưng luôn dựa backend RBAC; state demo phải dán nhãn rõ.
- Bundle entry có budget và component có semantic/ARIA cơ bản.

**Còn thiếu phải bổ sung**

- `MISSING P0`: không được ship `/permissions` hoặc `/config` như chức năng thật khi backend chưa
  persist/enforce/audit; UI phải disable hoặc ghi demo rõ.
- `MISSING P0`: step-up auth, idle timeout, staff session management, secure workstation policy và
  cảnh báo hành động đặc quyền.
- `MISSING P1`: export/download phải watermark/audit/limit field; không cho list API rộng biến thành
  công cụ trích toàn bộ PII.

### 13.23 Observability, metric, trace, log và audit — `ENFORCED/PARTIAL`

**Đang áp dụng**

- Pino structured log có request ID và danh sách redact chung cho authorization, cookie, OTP, phone,
  receipt, token và location.
- Prometheus metrics cho HTTP và domain nhạy cảm; OpenTelemetry opt-in export trace và tự instrument
  HTTP/Postgres/Redis. Error response mang trace ID.
- Health liveness/readiness tách biệt; audit dùng cho hành vi admin/domain nhạy cảm.

**Còn thiếu phải bổ sung**

- `MISSING P0`: `/metrics` của core/signaling đang public theo route app và skip auth/throttle; phải
  giới hạn bằng internal Service/NetworkPolicy/ingress auth hoặc không expose qua public ingress.
- `MISSING P1`: SLI/SLO, error budget, paging threshold, dashboard owner và runbook chưa định nghĩa
  đầy đủ cho Auth, Economy, Matching, Calling, Kafka, DB và provider.
- `MISSING P1`: trace collector/storage/retention/sampling và correlation event/job/audit phải được
  vận hành thật; code opt-in không đồng nghĩa trace đang được thu.
- `MISSING P1`: cardinality/privacy budget cho label/log/trace; không đưa user ID/phone/token làm
  Prometheus label hoặc span attribute không kiểm soát.

### 13.24 Config, secret và cryptographic key — `PARTIAL`

**Đang áp dụng**

- Backend env được Joi validate, frontend env được typed/validate; không đọc env rải rác.
- Secret không vào source/image/log; secret placeholder tách khỏi ConfigMap; dev provider bị chặn
  khi `NODE_ENV=production`.
- Rotate phải xét JWT, OTP pepper, DB, Redis, Kafka, LiveKit, store/provider và webhook key.

**Còn thiếu phải bổ sung**

- `MISSING P0`: chọn secret manager chính thức, workload identity/access policy, audit và rotation
  automation; Kubernetes Secret placeholder không tự cung cấp mã hoá/rotation an toàn.
- `MISSING P0`: TLS/cert-manager cho ingress và TLS tới DB/Redis/Kafka/provider chưa được đóng bằng
  ADR + manifest + expiry alert.
- `MISSING P1`: config change cần version, actor, approval, rollout/rollback và audit; env hợp lệ về
  type vẫn có thể nguy hiểm về nghiệp vụ.
- `MISSING P1`: key hierarchy, algorithm/length, cryptoperiod và emergency rotation drill cần owner.

### 13.25 Docker, Kubernetes, edge và scaling — `ENFORCED/PARTIAL`

**Đang áp dụng**

- Runtime container non-root, read-only root filesystem, seccomp RuntimeDefault, drop capabilities,
  resource request/limit, probe và graceful termination.
- Core/signaling có HPA + PDB; signaling sticky session tại nginx ingress. Media không HPA có chủ
  đích vì topology RTC.
- Image ứng dụng build trong CI theo commit; LiveKit pin digest. Kustomize tách base/overlay.

**Còn thiếu phải bổ sung**

- `MISSING P0`: hiện chưa có Kubernetes `NetworkPolicy`; phải deny-by-default ingress/egress và mở
  đúng luồng core/DB/Redis/Kafka/LiveKit/Prometheus/DNS/provider.
- `MISSING P0`: TLS/cert-manager, hostname thật, secret provisioning và cloud firewall vẫn là gate
  trước traffic công khai.
- `MISSING P1`: workload identity, ServiceAccount riêng, namespace quota, topology spread/anti-
  affinity và autoscaling theo domain metric cần được đánh giá/thêm bằng evidence.
- `MISSING P1`: deployment canary/rollback automation và compatibility gate DB/event/config; rolling
  update không tự đảm bảo release an toàn.

### 13.26 CI/CD và software supply chain — `ENFORCED/PARTIAL`

**Đang áp dụng**

- GitHub Actions được pin commit SHA; dependency review chặn dependency high-risk mới.
- Gitleaks, CodeQL, dependency audit, Trivy source/image scan và CycloneDX SBOM artifact đã có.
- Build/test/migration/image smoke/health là required pipeline; pnpm lockfile frozen.

**Còn thiếu phải bổ sung**

- `MISSING P1`: ký image/artifact (cosign), provenance/attestation, verify signature tại admission và
  promotion cùng digest từ staging sang production.
- `MISSING P1`: branch protection, required reviewer/CODEOWNERS, environment approval và least-
  privilege OIDC phải được cấu hình/chụp bằng chứng trên Git host; YAML trong repo không chứng minh.
- `MISSING P1`: SBOM cần policy theo dõi CVE sau build và recall artifact; upload 30 ngày không phải
  vulnerability management đầy đủ.

### 13.27 Testing và verification — `ENFORCED/PARTIAL`

**Đang áp dụng**

- Có unit, integration DB thật, HTTP/browser E2E, property/concurrency/chaos cho luồng nhạy cảm,
  boundary/guard/workflow tests và loadtest scaffold.
- `review-module verify` là gate bắt buộc trước khi báo xong; sensitive flow cần assumption table,
  vị trí chặn và bằng chứng test thật.
- CI fail khi app/test target không boot hoặc không có test; coverage dùng ratchet.

**Còn thiếu phải bổ sung**

- `MISSING P0`: launch test trên provider thật/sandbox thật cho SMS, IAP, LiveKit, object storage,
  push và ingress TLS; mock/dev port không thay thế integration môi trường.
- `MISSING P1`: restore drill, regional/dependency failure game day, browser/device matrix và a11y
  automation phải thành lịch định kỳ.
- `MISSING P1`: load test cần baseline được ký theo commit/config/workload; số chưa benchmark không
  được dùng đặt capacity/SLO.

### 13.28 Vận hành, release, backup và incident — `PARTIAL`

**Đang áp dụng**

- Release phải migration-compatible, chạy check/test/build, health/readiness và có forward/rollback
  plan. Không sửa dữ liệu production bằng thao tác ad-hoc không audit.
- Incident ưu tiên containment → preserve evidence → revoke/rotate → restore invariant → RCA/test.
- Secret lộ phải rotate kể cả đã xoá khỏi branch; backup phải được bảo vệ như production data.

**Còn thiếu phải bổ sung**

- `MISSING P0`: định nghĩa RPO/RTO, backup/PITR, restore owner và drill cadence cho Postgres, object
  storage, config/secret và audit evidence.
- `MISSING P0`: incident severity, on-call/escalation, communication, breach assessment/notification
  và authority cho emergency shutdown/kill switch.
- `MISSING P1`: feature/config kill switch theo domain/region, audit người bật/tắt và test fail-safe.
- `MISSING P1`: business continuity khi SMS/IAP/push/Kafka/Redis/LiveKit/region lỗi; mỗi dependency
  cần degradation policy, không chỉ retry.
- `MISSING P2`: cost budget/capacity forecast và review định kỳ; không tối ưu chi phí bằng cách bỏ
  redundancy, log, backup hoặc security gate mà không có quyết định rõ.

### 13.29 Backlog nguyên tắc bổ sung theo mức ưu tiên

**P0 — chặn public production hoặc chặn thao tác đặc quyền tương ứng**

1. TLS/cert-manager + secret manager + rotation evidence.
2. NetworkPolicy deny-by-default và `/metrics` chỉ nội bộ.
3. Distributed rate limit/anti-abuse cho OTP và public API nhiều replica.
4. Granular staff capability, role-change audit, step-up auth và thu hồi access token khẩn cấp.
5. Data classification, retention, account deletion/export và privacy propagation.
6. Backup/PITR với RPO/RTO và restore drill thành công.
7. Provider thật được test: SMS; IAP/webhook; video storage/transcode; push nếu feature bật.
8. LiveKit/TURN/UDP/TLS/capacity test trên hạ tầng và mạng thiết bị thật.
9. Alert/runbook cho ledger imbalance, auth abuse, provider failure và incident severity.

**P1 — làm ngay sau P0, trước khi scale lớn**

1. Event inbox/DLQ/replay/schema compatibility; SLO/error budget cho từng domain.
2. CSP chặt, WCAG 2.2 AA gate, browser/device/performance budget.
3. Socket/session mid-flight revocation, overload/backpressure và resilience game day.
4. Supply-chain signing/provenance, Git host approval evidence, post-build CVE response.
5. Config/feature flag audit, canary deployment, DB expand-contract và dependency degradation.

**P2 — tăng độ trưởng thành sau khi có vận hành thật**

1. Cost/capacity forecasting, automatic policy-as-code mở rộng và compliance evidence automation.
2. Nâng SLO/capacity theo traffic thật; tách service chỉ khi số liệu + ADR buộc phải tách.

### 13.30 Cách biến một mục `MISSING` thành luật thật

1. Ghi threat/business assumption và acceptance criteria; chỉ rõ out-of-scope.
2. Cập nhật nguồn canonical phù hợp (`docs/03`, `05`, `06`, `12`, `13` hoặc ADR mới).
3. Gán owner, severity, deadline và dependency.
4. Chọn enforcement gần nguồn sự thật nhất: DB constraint/transaction → server guard/domain → edge/
   platform policy → CI; review tay chỉ dùng khi máy không thể chứng minh.
5. Viết positive + negative + race/failure test thích hợp; ghi metric/audit và rollback/forward plan.
6. Cập nhật `docs/14-rule-enforcement-matrix.md`, chạy `pnpm agent:check` và `review-module verify`.

Không đóng backlog bằng cách chỉ sửa câu chữ trong file này, ẩn nút trên frontend, đổi nhãn thành
“an toàn”, thêm một comment hoặc tắt test/guard đang báo lỗi.

### 13.31 Bộ câu đúc kết — triết lý làm nghề đang dùng trong Litmatch

Đây là bản “nói một câu là nhớ”. Các câu dưới đây là nhãn ghi nhớ cho nguyên lý dài ở docs/code,
không phải nguồn luật mới. Trạng thái `ENFORCED` nghĩa là đã có chốt máy/DB/test; `APPLIED` nghĩa là
đang được dùng rõ trong thiết kế nhưng một phần còn review tay hoặc chưa có bằng chứng production.

#### A. Kiến trúc và scale

| Câu đúc kết                                                      | Ý nghĩa cụ thể trong Litmatch                                                                                  | Trạng thái / bằng chứng                             |
| ---------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------- | --------------------------------------------------- |
| **“Thiết kế scale sớm, triển khai scale muộn.”**                 | Chọn boundary/topology có đường scale từ đầu, nhưng chỉ mua tài nguyên, tăng replica hoặc tách service khi đo. | `APPLIED` — docs/03, docs/11, ADR 0001/0005/0006    |
| **“Đo trước khi tối ưu.” — Measure, don't guess.**               | Metric/benchmark/sự cố phải chỉ ra vấn đề; không tối ưu bằng cảm giác.                                         | `APPLIED` — docs/03 § 3.4/3.8, loadtest, HPA notes  |
| **“Nghẽn ở đâu, mở ở đó.”**                                      | Core nghẽn thì scale core; signaling nhiều connection thì scale gateway; room lớn không chữa bằng thêm API.    | `APPLIED` — HPA core/signaling; media có trần riêng |
| **“Scale đúng trục, không nhân cả hệ thống.”**                   | CPU, connection, room size, DB write và region là các trục khác nhau; mỗi trục có biện pháp riêng.             | `APPLIED` — docs/03 § 3.3–3.8                       |
| **“Bắt đầu là module; chỉ thành service khi số liệu bắt buộc.”** | Domain mới vào modular monolith; deployable thứ tư cần số liệu + ADR + migration/rollback.                     | `ENFORCED` — AGENTS luật 1 + guard-core             |
| **“Boundary trước, phân tán sau.”**                              | Làm data ownership/public contract rõ trong một process trước khi đưa qua network.                             | `ENFORCED` — module boundary/Nx guard               |
| **“Một room phải vừa một node.”**                                | LiveKit multi-node chia room giữa node, không xé một room qua nhiều node.                                      | `APPLIED` — ADR 0001/0005 + media manifest          |
| **“Correctness trước performance.”**                             | Không đổi tính đúng, tiền hay privacy lấy latency; Postgres là truth, Redis chỉ projection.                    | `ENFORCED/APPLIED` — docs/11 + DB/ledger tests      |
| **“Simplicity trước extensibility tưởng tượng.” — KISS/YAGNI.**  | Không dựng microservice, generic framework hay extension point cho nhu cầu chưa tồn tại.                       | `APPLIED` — docs/11 § 11.2                          |
| **“Công suất chưa benchmark chỉ là giả định.”**                  | CPU/memory/room cap trong manifest là điểm bắt đầu, không phải cam kết production.                             | `APPLIED` — k8s comments + loadtest docs            |

#### B. Thiết kế code và ranh giới

| Câu đúc kết                                                                      | Ý nghĩa cụ thể trong Litmatch                                                                          | Trạng thái / bằng chứng                               |
| -------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------ | ----------------------------------------------------- |
| **“Don't Repeat Yourself — đừng lặp tri thức.”**                                 | Một rule/error/config/schema/helper có một chủ quản; nơi khác import hoặc derive.                      | `ENFORCED/APPLIED` — docs/11, guard/checklist         |
| **“DRY có chọn lọc; AHA trước abstraction.”**                                    | Hai đoạn giống hình thức chưa chắc cùng ý nghĩa; chỉ gom khi đã hiểu cách chúng thay đổi.              | `APPLIED` — docs/11 § DRY/AHA                         |
| **“Lặp hai lần chưa chắc là pattern; abstraction sai còn đắt hơn duplication.”** | Không đẩy domain helper vào `common/` chỉ vì nhìn giống nhau hoặc để dành.                             | `APPLIED` — docs/11 + module conventions              |
| **“Code nói WHAT; comment nói WHY.”**                                            | Tên/type/structure nói code làm gì; comment giữ lý do nghiệp vụ, security, lock, framework hoặc ADR.   | `APPLIED` — docs/11 § Comment                         |
| **“Thứ thay đổi cùng nhau nên ở gần nhau.” — High cohesion.**                    | Controller/service/entity/spec của cùng domain ở cùng module; không tách chỉ vì file dài.              | `APPLIED` — module structure + new-module/review flow |
| **“Biết ít về nội tạng nhau.” — Low coupling.**                                  | Module khác chỉ thấy public API/DTO/event, không import service/entity nội bộ.                         | `ENFORCED` — module-boundary spec                     |
| **“Ai sở hữu ý nghĩa, người đó sở hữu quyền ghi.”**                              | Economy ghi ledger; Matching ghi ticket; module khác không viết xuyên bảng.                            | `ENFORCED/APPLIED` — domain ownership + writer rules  |
| **“Common phải trung lập; domain giữ ngôn ngữ của domain.”**                     | `common/` không chứa khái niệm riêng Economy/Matching/Calling.                                         | `ENFORCED` — dependency direction/Nx                  |
| **“Một sự thật, một nơi chủ quản.” — Single source of truth.**                   | OpenAPI có một builder, ledger là truth của tiền, env có module đọc tập trung.                         | `ENFORCED` — OpenAPI check, ledger, env guard         |
| **“Qua boundary phải có contract; đừng bắt consumer đoán.”**                     | HTTP DTO/OpenAPI, module API, event version và migration đều tường minh.                               | `ENFORCED/APPLIED` — DTO/codegen/event/migration      |
| **“Tên phải nói đúng sự thật.”**                                                 | Identifier không được che domain/contract; tên sai là semantic bug chứ không chỉ style.                | `APPLIED` — docs/17 + review tay                      |
| **“Config là code có thể gây sự cố.”**                                           | Giá, TTL, threshold, interval không hardcode; type/validate lúc boot và thay đổi phải được review.     | `ENFORCED/PARTIAL` — Joi/Zod + env guards             |
| **“Explicit tốt hơn implicit.”**                                                 | Public route, role, transition, event version, transaction và side effect phải nhìn ra được.           | `APPLIED` — decorators/state machines/contracts       |
| **“Framework đã có thì đừng tự chế bản thứ hai.”**                               | Dùng primitive chung, enum/type/helper chuẩn; tránh hai implementation gần giống nhưng lệch edge case. | `APPLIED` — docs/10 § Code hygiene                    |

#### C. Dữ liệu, concurrency và business correctness

| Câu đúc kết                                                            | Ý nghĩa cụ thể trong Litmatch                                                                                | Trạng thái / bằng chứng                          |
| ---------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------ | ------------------------------------------------ |
| **“Server quyết định; client chỉ đề nghị.”**                           | Không tin role, price, balance, duration, owner, VIP, grant hay workflow state từ UI/request.                | `ENFORCED/APPLIED` — DTO + guards + domain tests |
| **“Kiểm tra lại đúng lúc hành động.”**                                 | Block, balance, role, eligibility có thể đổi giữa flow; phải re-check khi match/spend/join/settle.           | `ENFORCED/APPLIED` — docs/10 + integration tests |
| **“Có retry thì phải có idempotency.”**                                | Timeout/reconnect/webhook retry không được nhân tiền, gift, event hoặc session.                              | `ENFORCED` ở sensitive flows                     |
| **“Check và act phải cùng một atomic boundary.”**                      | Không đọc rồi ghi rời; dùng unique, transaction, conditional update hoặc lock phù hợp.                       | `ENFORCED` ở Economy/Matching                    |
| **“Invariant nằm càng gần dữ liệu càng tốt.”**                         | Unique/check/trigger/transaction ở DB là chốt cuối; UI hoặc `if` trước insert không chống được race.         | `ENFORCED` — migrations + integration tests      |
| **“Một invariant, một writer.”**                                       | Không có hai service cùng tự cập nhật wallet/ledger hoặc cùng diễn giải một state machine.                   | `ENFORCED/APPLIED` — LedgerService/domain APIs   |
| **“Cache là bản sao, không phải sự thật.”**                            | Redis/cache mất hoặc lệch phải rebuild/degrade từ Postgres, không làm thay đổi kết quả nghiệp vụ.            | `APPLIED` — docs/11                              |
| **“REST là truth; socket là delta.”**                                  | Reconnect phải refetch REST; Socket.IO không phải database hoặc nơi quyết định quyền.                        | `ENFORCED/APPLIED` — docs/12 + frontend hooks    |
| **“Lịch sử không sửa; sửa sai bằng một sự kiện mới.”**                 | Ledger/ADR/audit append-only; reversal hoặc ADR mới giữ nguyên dấu vết cũ.                                   | `ENFORCED/APPLIED`                               |
| **“Read-path giữ correctness; sweeper chỉ dọn nhà.”**                  | Story hết hạn phải bị filter khi đọc dù cron chưa chạy.                                                      | `ENFORCED` — story service/integration test      |
| **“DB write và durable event phải cùng số phận.”**                     | Khi mutation cần publish event bền vững, ghi outbox cùng transaction rồi relay sau commit.                   | `ENFORCED` ở Economy/durable flows               |
| **“State machine không tin người dùng đi đúng đường.”**                | API bước cuối không được gọi bỏ qua bước đầu; terminal state không hồi sinh; race chỉ cho transition hợp lệ. | `ENFORCED/APPLIED` — domain state/test           |
| **“Tiền là số nguyên và là sổ cái, không phải con số trên màn hình.”** | Diamond dùng ledger kép; wallet/display chỉ là snapshot.                                                     | `ENFORCED` — AGENTS luật 2                       |
| **“Giới hạn phải chặn ở server, không chỉ ẩn nút.”**                   | Cooldown, rate limit, role và quyền phải tồn tại khi gọi API trực tiếp.                                      | `ENFORCED/PARTIAL` — backend guards              |

#### D. Security, failure, test và vận hành

| Câu đúc kết                                                               | Ý nghĩa cụ thể trong Litmatch                                                                    | Trạng thái / bằng chứng                             |
| ------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------ | --------------------------------------------------- |
| **“Deny by default.”**                                                    | Không có grant rõ thì từ chối; validate boundary, ownership và backend RBAC.                     | `ENFORCED/APPLIED`                                  |
| **“Frontend guard là UX, không phải security.”**                          | Route ẩn/nút disabled không thay backend authorization.                                          | `ENFORCED` — Admin/core RBAC                        |
| **“Tiện cho dev không được lọt vào production.”**                         | Dev SMS/IAP/push/video provider phải làm production boot fail thay vì chạy giả.                  | `ENFORCED` — provider bootstrap guards              |
| **“Failure phải hữu hạn.”**                                               | Dependency call cần timeout, retry có giới hạn và trạng thái lỗi; không treo vô hạn/retry storm. | `APPLIED/PARTIAL` — nguyên lý có, coverage chưa đều |
| **“Một lỗi không được để lại nửa giao dịch.”**                            | Atomic transaction/outbox/rollback; dependency phụ không làm nguồn dữ liệu ở trạng thái nửa vời. | `ENFORCED` ở sensitive flows                        |
| **“Không có bằng chứng thì chưa xong.”**                                  | Docs, test pass, DB invariant, trace/audit và review verify mới tạo kết luận.                    | `ENFORCED` — AGENTS luật 3                          |
| **“Test hành vi và invariant, không thờ coverage.”**                      | Test race, retry, balance, transition và failure; coverage chỉ là tín hiệu.                      | `ENFORCED/APPLIED`                                  |
| **“Observability được thiết kế cùng feature.”**                           | Trace ID, metric, structured log và audit không đợi production cháy mới thêm.                    | `APPLIED/PARTIAL` — metrics/log/tracing hiện có     |
| **“Log phải giúp điều tra mà không tạo sự cố mới.”**                      | Log có correlation nhưng redact auth, cookie, OTP, phone, receipt, token và location.            | `ENFORCED` — logger redaction tests                 |
| **“Mọi thay đổi nguy hiểm cần đường tiến và đường lùi.”**                 | API/event/DB/config phải compatible, có migration/rollback hoặc forward-fix plan.                | `APPLIED` — ADR/migration/release rules             |
| **“Rule cứng phải có positive test và negative test.”**                   | Không chỉ test việc hợp lệ được qua; phải chứng minh việc sai bị chặn đúng nơi.                  | `ENFORCED/APPLIED` — docs/14                        |
| **“Đừng dùng regex/coverage để giả vờ chứng minh business correctness.”** | Máy kiểm boundary; domain invariant cần DB/integration/property test và reviewer hiểu nghiệp vụ. | `APPLIED` — docs/14                                 |
| **“Secret đã lộ thì xoá file chưa đủ; phải rotate.”**                     | History, artifact và log có thể còn credential; revoke/rotate/điều tra mới đóng incident.        | `APPLIED` — security/runbook                        |

#### E. Những câu đúc kết dự án còn thiếu hoặc mới làm được một phần

| Câu cần bổ sung                                                           | Vì sao Litmatch cần câu này                                                           | Ưu tiên / điều kiện để gọi là đã áp dụng                    |
| ------------------------------------------------------------------------- | ------------------------------------------------------------------------------------- | ----------------------------------------------------------- |
| **“Backup chỉ tồn tại sau khi restore thành công.”**                      | Có file dump không chứng minh khôi phục đúng hoặc đạt RPO/RTO.                        | `P0` — PITR + restore drill + biên bản định kỳ              |
| **“You build it, you run it.” — Ai xây, người đó chịu vận hành.**         | Feature không có owner/on-call/runbook dễ thành trách nhiệm vô chủ.                   | `P0/P1` — owner + SLO + pager/runbook                       |
| **“Alert không có owner thì chỉ là tiếng ồn.”**                           | Metric có nhưng thiếu threshold, escalation và người phản ứng không tạo reliability.  | `P1` — từng alert có owner/severity/action                  |
| **“Least privilege, just enough, just in time.”**                         | Moderator đang có blast radius gần admin; credential dài hạn tăng rủi ro.             | `P0` — capability RBAC + time-bound access + review         |
| **“Không ai vừa yêu cầu vừa tự duyệt thao tác rủi ro.”**                  | Refund lớn, cấp quyền, export dữ liệu cần separation of duties.                       | `P0` — four-eyes workflow + immutable audit                 |
| **“Token nhạy cảm phải thu hồi được, không chỉ chờ hết hạn.”**            | JWT đang giữ role/status cũ tới TTL.                                                  | `P0` — token/session version hoặc denylist + test           |
| **“Global limit phải thực sự global.”**                                   | Rate limit memory theo replica không tạo quota toàn hệ thống.                         | `P0` — distributed/edge limiter + multi-replica test        |
| **“Telemetry là nội bộ theo mặc định.”**                                  | `/metrics` public có thể lộ topology và traffic.                                      | `P0` — internal service/network policy/auth                 |
| **“Dữ liệu không thu thì không thể bị lộ.” — Data minimization.**         | Mã hoá không thay thế việc không thu field không cần thiết.                           | `P0` — data inventory/purpose/minimization review           |
| **“Delete là một tính năng; retention là một hợp đồng.”**                 | Account/media/location/log/backup phải có vòng đời và propagation rõ.                 | `P0` — deletion/export/legal-hold/retention flow            |
| **“Mỗi exception phải có ngày hết hạn.”**                                 | Waiver tạm thời dễ trở thành kiến trúc vĩnh viễn không ai review lại.                 | `P1` — exception registry + owner + expiry + CI reminder    |
| **“Mỗi dependency ngoài phải có degradation mode.”**                      | Timeout/retry không đủ khi SMS, IAP, Redis, Kafka, Push hoặc LiveKit chết lâu.        | `P0/P1` — timeout budget + circuit/degrade/runbook          |
| **“Không queue, query, retry hay cardinality nào được vô hạn.”**          | Tài nguyên không bounded sẽ thành DoS hoặc outage khi scale.                          | `P1` — limit/pagination/backoff/TTL/cardinality budget      |
| **“Queue không có DLQ/replay thì chưa vận hành được.”**                   | Poison event hoặc consumer lỗi cần quarantine, inspect và replay an toàn.             | `P1` — inbox/DLQ/replay + idempotent consumer               |
| **“Schema change là một rollout protocol, không chỉ là migration file.”** | App cũ/mới cùng chạy, backfill và rollback có thể phá compatibility.                  | `P1` — expand/migrate/contract + canary/data verification   |
| **“Feature flag cũng là production code và phải chết đúng hạn.”**         | Flag/config không owner/expiry tạo nhánh logic cũ và quyền bật không audit.           | `P1` — owner + expiry + audit + cleanup test                |
| **“SLO trước autoscale.”**                                                | Thêm replica mà không biết mục tiêu latency/error/wait time không chứng minh tốt hơn. | `P1` — SLI/SLO/error budget theo component                  |
| **“Production confidence đến từ production-like evidence.”**              | Mock/dev provider không chứng minh SMS/IAP/LiveKit/storage/push thật hoạt động.       | `P0` — sandbox/staging/device/network test                  |
| **“Kết nối dài cũng phải được xác minh lại.”**                            | Socket/media đã handshake vẫn có thể giữ quyền sau ban/hết token/đổi role.            | `P1` — mid-flight reauth/revoke/disconnect test             |
| **“Sign what you ship; verify what you run.”**                            | Scan/SBOM chưa chống artifact bị thay hoặc deploy sai image.                          | `P1` — signing/provenance/admission verification            |
| **“Accessibility là correctness, không phải trang trí.”**                 | Có ARIA rải rác chưa chứng minh keyboard/screen-reader/contrast đúng.                 | `P1` — WCAG 2.2 AA + axe/browser/manual test                |
| **“Con đường an toàn phải là con đường mặc định và dễ nhất.”**            | Guard gắn thủ công như CSRF dễ bị quên khi thêm route mới.                            | `P0/P1` — secure-by-construction metadata/global policy     |
| **“Graceful degradation tốt hơn retry storm.”**                           | Retry đồng loạt khi dependency lỗi có thể khuếch đại sự cố.                           | `P1` — retry budget, jitter, circuit breaker, load shedding |
| **“Mọi secret phải có owner, nơi lưu và ngày rotate.”**                   | “Không commit secret” mới ngăn một vector, chưa tạo lifecycle an toàn.                | `P0` — secret manager + inventory + automated rotation      |

#### F. Bộ nhớ bỏ túi cho owner

> Server quyết định, client chỉ đề nghị.  
> Domain giữ ý nghĩa; boundary giữ khoảng cách.  
> Một sự thật, một writer, một contract.  
> Có retry thì có idempotency; có race thì có atomicity.  
> Cache là bản sao; ledger là lịch sử.  
> Code nói WHAT; comment nói WHY.  
> DRY tri thức, không vội DRY hình thức.  
> Đo trước khi tối ưu; nghẽn đâu mở đó.  
> Thiết kế scale sớm, trả tiền cho scale muộn.  
> Dev có thể giả; production phải fail-closed.  
> Không có test/bằng chứng thì chưa xong.  
> Backup chưa restore, token chưa revoke, alert chưa có owner — đều chưa hoàn chỉnh.

---

## 14. Quy tắc xử lý chính file này

- Kiểm tra quyền: `stat -c '%a %n' .owner/OWNER-RUNBOOK.private.md` phải là `600`.
- Kiểm tra Git: `git check-ignore -v .owner/OWNER-RUNBOOK.private.md` phải chỉ ra
  `.git/info/exclude`.
- Không thêm secret thật. Chỉ ghi tên secret, owner, nơi lưu, version/rotation date trong hệ
  quản lý secret chuyên dụng.
- Khi clone repo sang máy mới, file này không đi theo Git. Copy bằng kênh mã hoá hoặc tái tạo từ
  nguồn được kiểm soát.
- Nếu nghi file bị lộ, coi là lộ bản đồ vận hành: review quyền máy/repo/DB/cluster và rotate các
  credential có dấu hiệu liên quan; bản thân file không chứa giá trị secret để giảm blast radius.

Nguồn canonical luôn thắng file này nếu code/docs đã thay đổi. Sau mỗi thay đổi lớn ở Auth,
Admin, Economy, deployment hoặc incident response, cập nhật runbook và đối chiếu lại ngày ở đầu.
