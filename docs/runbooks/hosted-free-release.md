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

`migration PostgreSQL → build/deploy Core + Signaling đúng SHA → deploy Web + Admin song song → smoke 4 URL đồng thời`.

Frontend deploy vẫn chỉ chạy sau khi hai backend build exact SHA thành công. Smoke public dùng
retry bounded cho cả bốn URL đồng thời và fail-closed nếu bất kỳ endpoint nào không ready.

Release lỗi dừng tại bước lỗi và không tự nâng plan. Khi Upstash free bị archive do không hoạt
động, restore database trong console rồi cập nhật `REDIS_URL`; Redis không phải nguồn sự thật của
ledger. Kafka giữ `ECONOMY_OUTBOX_RELAY_ENABLED=false`; event vẫn nằm trong outbox để replay sau.

### 3.1. Idle runtime và kiểm tra Upstash usage

Core API coi process là **idle** sau 5 phút không có request nghiệp vụ; `/health`, `/health/ready`,
`/metrics` và `/swagger` không đánh thức trạng thái này. Khi idle, các timer chỉ làm backstop hoặc
dọn dữ liệu không cấp thiết sẽ bỏ qua tick, trong đó có matcher backstop. Matching vẫn được đánh
thức ngay bởi enqueue event; call ticker, reconciliation và outbox không bị gate vì chúng bảo vệ
trạng thái đang chạy hoặc tính đúng đắn.

Nếu Upstash vẫn tăng command khi không có user, kiểm tra theo thứ tự:

1. Usage → **Top Commands Usage** hoặc Monitor để xác định lệnh và client phát sinh.
2. Nếu vừa mở Data Browser/Usage của Upstash, Console có thể tự gửi `SCAN`, `GET`, `TTL` và
   `EXISTS`; đó không nhất thiết là traffic từ ứng dụng.
3. Nếu thấy `SMEMBERS` từ Core API, kiểm tra matcher interval và activity gate; không tắt Redis
   readiness bằng cách xoá health check vì `PING` là probe không đại diện cho user traffic.

Core API cũng export `runtime_active`, `runtime_last_meaningful_request_age_seconds`,
`runtime_meaningful_requests` và `runtime_background_skipped{job}`. Đây là bằng chứng để điều chỉnh mốc 5 phút hoặc cadence
job sau khi có traffic thật; không đặt ngưỡng scale mới chỉ từ cảm giác hoặc vài tài khoản test.

Profile hosted-free không tự nâng plan hoặc tự tăng số service ngoài quota. Khi release thật vượt
ngưỡng, Kubernetes profile mới là đường autoscaling hiện hành qua HPA CPU/memory; custom metric
như queue depth/Socket.IO connections chỉ bật sau khi có số liệu production và adapter đã được
kiểm chứng.

### 4. Facebook Login và observability

1. Trong Meta for Developers tạo app loại Consumer, thêm Facebook Login/Web, khai **App Domains**
   là domain Web thật và thêm URL Web thật vào **Valid OAuth Redirect URIs**. Lấy App ID và App
   Secret; chỉ App ID đi vào GitHub Variable `FACEBOOK_APP_ID` (build public), còn cả hai đi vào
   biến runtime Core `AUTH_FACEBOOK_APP_ID`/`AUTH_FACEBOOK_APP_SECRET` trên Northflank.
2. Tạo bốn Sentry projects (core-api, signaling-gateway, web, admin). DSN backend là biến runtime
   `SENTRY_DSN` của từng Northflank service; DSN browser là hai GitHub Variables
   `NEXT_PUBLIC_SENTRY_DSN`/`VITE_SENTRY_DSN`. Đặt `SENTRY_RELEASE` bằng commit SHA deploy.
3. Trong Grafana Cloud, vào **Connections > OpenTelemetry**, lấy OTLP endpoint dạng
   `https://otlp-gateway-<region>.grafana.net/otlp/v1/metrics`, username và token. Điền
   `GRAFANA_CLOUD_PROMETHEUS_URL`, `GRAFANA_CLOUD_PROMETHEUS_USER`,
   `GRAFANA_CLOUD_API_TOKEN` vào cả hai service Northflank. Code tự động tạo header
   `Authorization: Basic <base64>` từ User và Token, gửi metrics tới `/v1/metrics` mỗi 15 giây
   và log `[metrics] gửi thành công/thất bại` ra console. Không dùng Prometheus remote-write URL
   `/api/prom/push` cho biến này.
4. Biến `OTEL_EXPORTER_OTLP_HEADERS` không dùng cho metrics. Nếu cần tracing, giữ thêm
   `OTEL_EXPORTER_OTLP_ENDPOINT` và `OTEL_EXPORTER_OTLP_HEADERS` riêng từ OpenTelemetry connection.
5. Tạo Sentry alerts ban đầu: error mới, 5xx/error event tăng bất thường. Metrics app đã push
   trực tiếp lên Grafana; Alloy trong profile Compose/K8s vẫn hữu ích cho LiveKit và logs theo
   `docs/runbooks/grafana-cloud.md`.
