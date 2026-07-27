# Hosted-free release

Profile này dùng cho demo/alpha, máy cá nhân tắt vẫn chạy. Không có SLA; giữ mọi tài khoản ở free
plan và không bật auto-upgrade. Nguồn giới hạn hiện hành: [Northflank](https://northflank.com/pricing),
[Cloudflare](https://developers.cloudflare.com/workers/platform/pricing/),
[Upstash](https://upstash.com/pricing/redis), [LiveKit](https://docs.livekit.io/deploy/admin/quotas-and-limits/).

## 1. Provision một lần

1. Upstash: tạo một Redis Free ở region gần `asia-southeast`, lấy TLS URL `rediss://...`.
2. LiveKit Cloud: tạo project Build, lấy `wss://...`, API key và API secret. Sau khi Core có
   public URL, vào **Settings → Webhooks**, tạo hai webhook
   `<PUBLIC_API_URL>/api/v1/calling/webhooks/livekit` và
   `<PUBLIC_API_URL>/api/v1/party/webhooks/livekit`; chọn đúng API key đang cấu hình cho Core làm
   Signing API key, rồi gửi test event cho từng URL. Thiếu `/api/v1` hoặc thiếu webhook làm
   `participant_joined` không tới Core: call kẹt `pending`, không có mốc đếm ngược và chưa được
   phép gửi reaction.
3. Northflank: chọn Developer Sandbox, tạo project region `asia-southeast`, tạo PostgreSQL addon
   Free và bật public TLS endpoint để GitHub Actions chạy migration.
4. Northflank: tạo hai **combined service** từ repo/branch `main`, tắt CI tự động, giữ CD bật:
   Core dùng `/deploy/hosted/Dockerfile.core-api`, public HTTP port `3000`; Signaling dùng
   `/deploy/hosted/Dockerfile.signaling-gateway`, public HTTP/WebSocket port `3001`.
5. Import lần lượt `deploy/hosted/core-api.env.example` và
   `deploy/hosted/signaling-gateway.env.example`, thay placeholder. `JWT_SECRET` và `REDIS_URL`
   phải giống nhau ở hai service. Không log hoặc commit giá trị thật.
6. Cloudflare: tạo Pages project tên `litmatch-admin`; Worker `litmatch-web` sẽ được tạo ở lần
   deploy đầu. Tạo API token chỉ có Workers Scripts Edit + Pages Edit và lấy Account ID.

## 2. GitHub Secrets và Variables

Secrets: `NORTHFLANK_API_TOKEN`, `HOSTED_DATABASE_URL`, `CLOUDFLARE_API_TOKEN`,
`CLOUDFLARE_ACCOUNT_ID`.

Variables: `NORTHFLANK_PROJECT_ID`, `NORTHFLANK_CORE_SERVICE_ID`,
`NORTHFLANK_SIGNALING_SERVICE_ID`, `PUBLIC_API_URL`, `PUBLIC_SIGNALING_URL`,
`PUBLIC_LIVEKIT_URL`, `PUBLIC_WEB_URL`, `PUBLIC_ADMIN_URL`, `GOOGLE_OAUTH_CLIENT_ID` (được để
trống), `FACEBOOK_APP_ID`, `FACEBOOK_API_VERSION` (mặc định `v24.0`),
`NEXT_PUBLIC_SENTRY_DSN`, `VITE_SENTRY_DSN` (đều có thể để trống), và cuối cùng
`HOSTED_RELEASE_ENABLED=true`.

Không bật gate cuối cho tới khi mọi URL/env ở Northflank đã khớp. Core `CORS_ORIGINS` phải chứa
chính xác `PUBLIC_WEB_URL,PUBLIC_ADMIN_URL`; profile khác site phải giữ
`AUTH_COOKIE_SAME_SITE=none`.

## 3. Release và kiểm tra

Workflow `Hosted release` tự chạy sau khi workflow `CI` của `main` thành công:

`migration PostgreSQL → build/deploy Core + Signaling đúng SHA → deploy Web + Admin → smoke 4 URL`.

Release lỗi dừng tại bước lỗi và không tự nâng plan. Khi Upstash free bị archive do không hoạt
động, restore database trong console rồi cập nhật `REDIS_URL`; Redis không phải nguồn sự thật của
ledger. Kafka giữ `ECONOMY_OUTBOX_RELAY_ENABLED=false`; event vẫn nằm trong outbox để replay sau.

## 4. Facebook Login và observability

1. Trong Meta for Developers tạo app loại Consumer, thêm Facebook Login/Web, khai **App Domains**
   là domain Web thật và thêm URL Web thật vào **Valid OAuth Redirect URIs**. Lấy App ID và App
   Secret; chỉ App ID đi vào GitHub Variable `FACEBOOK_APP_ID` (build public), còn cả hai đi vào
   biến runtime Core `AUTH_FACEBOOK_APP_ID`/`AUTH_FACEBOOK_APP_SECRET` trên Northflank.
2. Tạo bốn Sentry projects (core-api, signaling-gateway, web, admin). DSN backend là biến runtime
   `SENTRY_DSN` của từng Northflank service; DSN browser là hai GitHub Variables
   `NEXT_PUBLIC_SENTRY_DSN`/`VITE_SENTRY_DSN`. Đặt `SENTRY_RELEASE` bằng commit SHA deploy.
3. Trong Grafana Cloud, tạo OTLP connection. Điền `OTEL_EXPORTER_OTLP_ENDPOINT` và
   `OTEL_EXPORTER_OTLP_HEADERS` (Authorization header do connection cấp) vào cả hai service
   Northflank. Đây chỉ là trace; metrics/logs của profile này chưa bật vì Alloy cần collector host.
4. Tạo Sentry alerts ban đầu: error mới, 5xx/error event tăng bất thường. Với Grafana, alert
   service mất trace/latency chỉ là signal phụ; SLO metrics/logs đầy đủ dùng profile Compose/K8s
   - Alloy theo `docs/runbooks/grafana-cloud.md`.
