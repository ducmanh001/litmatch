# Litmatch — Kubernetes manifests

Đây là hạ tầng deploy cho **đúng baseline 3 deployable backend** theo `AGENTS.md` luật 1 và
`docs/03-architecture.md § 3.2`: `core-api`, `signaling-gateway`, `media-server` (LiveKit
self-host). Không có app/service thứ 4 ở đây.

## Tooling: plain YAML + kustomize (built-in kubectl) — không phải quyết định kiến trúc

Dùng **kustomize** (built-in trong `kubectl`, không cần cài thêm tool/Helm) chỉ để tổ chức và
tái sử dụng YAML giữa các môi trường (base + overlay patch) — đây là lựa chọn **công cụ expose
YAML**, không phải quyết định kiến trúc/ADR. Nếu sau này cần templating phức tạp hơn (Helm chart,
giá trị tham số hoá nhiều), đó vẫn chỉ là đổi công cụ tooling, không đụng tới boundary/baseline.

Không dùng Helm ở đây vì: chỉ 3 app, số lượng biến môi trường tuy nhiều (239 khoá trong `CoreApiEnv`, đếm 2026-10-19) nhưng
không cần logic templating điều kiện phức tạp — kustomize patch/overlay là đủ và không thêm
dependency ngoài `kubectl`.

## Cấu trúc

```text
k8s/
  base/
    namespace.yaml            # namespace "litmatch" dùng chung cho cả 3 app
    core-api/                 # Deployment, Service, ConfigMap, Secret placeholder, HPA, PDB
    signaling-gateway/        # tương tự core-api, ít env hơn
    media-server/             # Deployment (replicas:1), Service, ConfigMap (livekit.yaml) — KHÔNG có HPA
  overlays/
    staging/                  # patch replica/resource nhỏ hơn, image tag "staging"
    production/               # patch replica/resource lớn hơn, image tag do CI ghi đè bằng git SHA
    production-region-b/      # SCAFFOLD region thứ hai (chưa provision) — region code placeholder, xem mục Multi-region
  ingress-nginx/
    cloudflare-real-ip-configmap.yaml  # ConfigMap controller trust proxy Cloudflare (ADR 0006) — apply riêng per-cluster, chưa provision
```

## Cách apply

```bash
# xem trước YAML sinh ra (không apply)
kubectl kustomize k8s/overlays/staging

# apply thật
kubectl apply -k k8s/overlays/staging
kubectl apply -k k8s/overlays/production
```

Đã build-test cả `k8s/base`, `k8s/overlays/staging`, `k8s/overlays/production` và
`k8s/overlays/production-region-b` (scaffold, xem mục Multi-region) bằng `kustomize build`
(kustomize v4.5.4 qua `npx kustomize`) — không lỗi cú pháp, patch match đúng target. **Lưu ý đã phát hiện lúc test**: với kustomize (ít nhất v4.5.4), một strategic-merge patch
target resource có `metadata.namespace` tường minh trong file gốc (không qua kustomize
`namespace:` transformer) thì **patch cũng phải khai `namespace: litmatch`** ở `metadata`, nếu
không kustomize báo `no matches for Id ... [noNs]` dù tên/kind đúng — tất cả patch trong
`overlays/*` đã thêm dòng này.

### Rollout / rollback

```bash
kubectl -n litmatch rollout status deployment/core-api
kubectl -n litmatch rollout undo deployment/core-api
```

`strategy.rollingUpdate.maxUnavailable: 0` cho core-api/signaling-gateway — deploy mới không giảm
capacity đang phục vụ. Base/staging `media-server` giữ một replica với `Recreate`.
Production overlays dùng hai replica, `RollingUpdate` với `maxSurge: 0`, `maxUnavailable: 1`,
và required pod anti-affinity theo hostname để không trùng cổng hostNetwork. PDB production
giữ ít nhất một pod cho voluntary eviction; PDB không ngăn crash hoặc điều khiển rollout Deployment.
LiveKit nhận SIGTERM để drain room hiện có; grace period 18.000 giây và progress deadline
18.600 giây cho phép rollout chờ drain. Theo [hướng dẫn Kubernetes của LiveKit](https://docs.livekit.io/transport/self-hosting/kubernetes/),
drain cần khoảng chờ dài. Pipeline/rollout watchdog phải cho phép thời gian này. Hết grace thì
Kubernetes cưỡng bức dừng pod; room trên pod crash hoặc hết grace không tự chuyển sang node khác.

### Đổi tag image (CI)

`overlays/*/kustomization.yaml` có `images:` transformer — CI chạy:

```bash
cd k8s/overlays/production
kustomize edit set image ghcr.io/litmatch/core-api=ghcr.io/litmatch/core-api:$GIT_SHA
kustomize edit set image ghcr.io/litmatch/signaling-gateway=ghcr.io/litmatch/signaling-gateway:$GIT_SHA
```

rồi `kubectl apply -k k8s/overlays/production`. `media-server` dùng image LiveKit chính thức
(pin digest, không tự build) nên không có image transformer riêng.

## Giả định vận hành (đọc trước khi deploy thật)

- **Postgres, Redis, Kafka là managed/external**, KHÔNG deploy trong k8s manifest này (theo yêu
  cầu task) — `DATABASE_URL`, `REDIS_URL` (core-api + signaling-gateway) trỏ managed service qua
  Secret; `KAFKA_BROKERS` trỏ managed Kafka qua ConfigMap (không chứa credential trong URL vì
  Kafka ở đây dùng PLAINTEXT theo docker-compose dev — nếu production bật SASL, `KAFKA_BROKERS`
  hoặc biến credential đi kèm phải chuyển sang Secret, hiện chưa có biến riêng cho việc này trong
  `env.validation.ts`, ghi chú lại đây để chủ thread xem xét khi bật SASL).
- **1 namespace `litmatch`** dùng cho tất cả 3 app trong **1 cluster** (theo yêu cầu task). Staging
  và production là 2 cluster khác nhau (hoặc 2 context `kubectl` khác nhau), MỖI cluster có
  namespace `litmatch` riêng của nó — không phải 2 namespace `litmatch-staging`/`litmatch-production`
  chung 1 cluster. Nếu chọn dùng chung 1 cluster cho cả 2 môi trường, cần đổi tên namespace theo
  môi trường (`litmatch-staging`, `litmatch-production`) — đó là thay đổi ngoài phạm vi PR này.
- **API Gateway ĐÃ CHỐT: nginx-ingress controller**
  ([ADR 0004](../docs/adr/0004-api-gateway-nginx-ingress.md)) — `base/core-api/ingress.yaml` và
  `base/signaling-gateway/ingress.yaml` (`ingressClassName: nginx`; signaling-gateway kèm cookie
  affinity cho Socket.IO polling). Hostname trong Ingress là placeholder REPLACE_ME (dạng
  DNS-hợp-lệ, TLD `.invalid`) — điền hostname thật theo môi trường. TLS/cert-manager là follow-on
  (ADR 0004 § Hệ quả), chưa khai `tls:` ở đây. Cluster thật phải cài nginx-ingress controller
  trước khi apply (không nằm trong manifest này).
- **Đăng nhập bằng số điện thoại ([ADR 0013](../docs/adr/0013-scale-readiness-policies.md))**: ConfigMap đặt
  `AUTH_OTP_DELIVERY: 'disabled'` (không trả mã OTP trong response). Trước khi apply lên cluster đang chạy, đặt
  `AUTH_GOOGLE_CLIENT_ID` (admin đăng nhập bằng Google hoặc SĐT; thiếu cả hai thì chỉ còn guest) hoặc chuyển
  `AUTH_OTP_DELIVERY: 'sms-http'` kèm `AUTH_OTP_SMS_HTTP_URL` (https) và `AUTH_OTP_SMS_HTTP_TOKEN` trong Secret.
  Retention dữ liệu vận hành mặc định `RETENTION_MODE: 'dry-run'` (chỉ đếm). **Một công tắc duy nhất**: đổi sang `delete`
  bật CÙNG LÚC mọi quy tắc đang có số ngày > 0 — thông báo (đọc 90/chưa đọc 365 ngày), `refresh_tokens` hết hạn quá 7
  ngày, OTP > 1 ngày, quota ghép > 2 ngày, outbox đã publish > 7 ngày, bình luận video xoá mềm > 30 ngày, sự kiện mood.
  Xem gauge `retention_eligible_rows{rule}` của TỪNG quy tắc trước khi đổi. Các quyết định chưa chốt mặc định TẮT (số ngày
  `0`): `VIDEO_VIEW_RETENTION_DAYS`, `AUTH_REFRESH_ROTATED_RETENTION_DAYS` (đánh đổi bảo mật, ADR 0014),
  `OUTBOX_DEAD_LETTER_RETENTION_DAYS`; muốn hoãn thêm quy tắc nào thì đặt số ngày của nó về `0` TRƯỚC khi đổi sang
  `delete`. Story sweeper không chịu `RETENTION_MODE` (luôn xoá story hết hạn; chu kỳ `STORY_SWEEPER_INTERVAL_MS`, mặc
  định 1 giờ — ở quy mô lớn cần ngắn hơn, xem ADR 0014).
- **Đối chiếu ConfigMap/Secret với `CoreApiEnv`** (`apps/core-api/src/config/env.validation.ts`, đếm 2026-10-19): 239
  khoá, trong đó 144 nằm trong ConfigMap, 14 trong Secret (credential/connection-string có thể chứa mật khẩu), 81 dùng
  mặc định trong mã (tuỳ chọn hoặc có mặc định an toàn: thông báo đẩy, AWS, PayOS, tinh chỉnh matching/discovery/video…).
  ConfigMap/Secret còn có 4 + 2 khoá ngoài `CoreApiEnv` (quan sát: `OTEL_*`, `GRAFANA_CLOUD_*`,
  `OBSERVABILITY_REQUIRED`). Các con số này đổi mỗi khi thêm biến: đừng coi là hợp đồng — **phải** đối chiếu lại
  `configmap.yaml`/`secret.yaml` trong cùng thay đổi mỗi khi sửa `env.validation.ts`. Secret placeholder gồm
  `JWT_SECRET`, `AUTH_OTP_PEPPER`, `AUTH_GUEST_DEVICE_TOKEN_SECRET`, `DATABASE_URL`, `REDIS_URL`,
  `ECONOMY_APPLE_SHARED_SECRET`, `ECONOMY_GOOGLE_SA_EMAIL`, `ECONOMY_GOOGLE_SA_PRIVATE_KEY`,
  `ECONOMY_APPLE_PRIVATE_KEY`, `LIVEKIT_API_KEY`, `LIVEKIT_API_SECRET`, `MEDIA_R2_ACCESS_KEY_ID`,
  `MEDIA_R2_SECRET_ACCESS_KEY`, `AUTH_FACEBOOK_APP_SECRET`, `OTEL_EXPORTER_OTLP_HEADERS`, `GRAFANA_CLOUD_API_TOKEN`.
- **Secret manifest KHÔNG chứa giá trị thật** — mọi giá trị đều là chuỗi `'REPLACE_ME...'`. Điền
  giá trị thật qua sealed-secrets (kubeseal) hoặc external-secrets-operator (Vault) tuỳ hạ tầng
  cluster thật — công cụ quản lý secret cụ thể **chưa chốt** ở thay đổi này, chỉ khai đúng tên key
  cần có.

## Xoay JWT_SECRET

Access token (TTL `JWT_ACCESS_TTL_SECONDS`, mặc định 900 giây) là JWT HS256 ký bằng `JWT_SECRET`; core-api
và signaling-gateway dùng CHUNG khoá này. Đổi thẳng khoá làm mọi token đang sống bị từ chối, và trong lúc
rollout (pod cũ và mới chạy song song) token do pod mới ký sẽ bị pod cũ từ chối. Vì vậy xoay theo 3 bước,
mỗi bước là một lần rollout đầy đủ của CẢ HAI app (thứ tự giữa hai app không quan trọng).
`JWT_SECRET_PREVIOUS` là khoá PHỤ chỉ để VERIFY (token luôn được ký bằng `JWT_SECRET`); nó phải khác
`JWT_SECRET` và khác `AUTH_GUEST_DEVICE_TOKEN_SECRET`.

1. **Phân phối khoá mới:** `JWT_SECRET` = khoá cũ, `JWT_SECRET_PREVIOUS` = khoá MỚI. Từ đây mọi pod verify
   được cả hai khoá, nhưng vẫn ký bằng khoá cũ.
2. **Chuyển sang ký bằng khoá mới:** `JWT_SECRET` = khoá mới, `JWT_SECRET_PREVIOUS` = khoá cũ. Pod cũ còn
   sót lại ở bước này vẫn verify được token mới nhờ khoá phụ, và token cũ còn sống vẫn được chấp nhận.
3. Chờ ít nhất `JWT_ACCESS_TTL_SECONDS` (cộng dư) sau khi bước 2 rollout xong, rồi xoá
   `JWT_SECRET_PREVIOUS` ở cả hai app.

Refresh token là chuỗi opaque lưu DB và guest device token dùng `AUTH_GUEST_DEVICE_TOKEN_SECRET` riêng, nên
không bị ảnh hưởng. Nếu khoá cũ nghi bị lộ thì KHÔNG dùng quy trình này: đổi `JWT_SECRET`, để trống
`JWT_SECRET_PREVIOUS` và chấp nhận mọi người phải đăng nhập lại. Rollback = quay về giá trị của bước trước
rồi rollout lại cả hai app.

## Resource sizing — vì sao core-api và signaling-gateway khác nhau

Theo `docs/03-architecture.md § 3.3`: signaling-gateway scale theo **số kết nối đồng thời**
(connection-bound), core-api scale theo **CPU/DB-bound** (business logic, query, tính toán
ledger/matching). Vì vậy:

- `core-api`: CPU request cao hơn (`500m` base → `750m` production), memory vừa phải.
- `signaling-gateway`: CPU request thấp hơn hẳn (`100m`), nhưng memory request cao hơn tỉ lệ
  (`768Mi` base → `1Gi` production) để giữ object socket/buffer cho nhiều connection Socket.IO
  đồng thời trong bộ nhớ Node process.

**Toàn bộ số CPU/memory trong repo này là số liệu khởi điểm (educated guess), CHƯA có benchmark
production thật** — điều chỉnh theo `loadtest/` (Phần 2) và dashboard Prometheus thật khi có
traffic (Giai đoạn 7, `docs/03 § 3.8` phân biệt rõ "quyết định thiết kế" chọn sớm khác với "vận
hành thật ở quy mô lớn" chỉ làm khi có số liệu).

## HorizontalPodAutoscaler

`core-api` và `signaling-gateway` có HPA `autoscaling/v2` dựa trên **CPU + memory** (resource
metrics chuẩn qua `metrics-server`, không cần cài thêm gì). Ngưỡng utilization (70%/75% cho
core-api, 60%/70% cho signaling-gateway) là gợi ý khởi điểm.

**Follow-up CHƯA làm ở PR này**: scale theo custom metric có ý nghĩa nghiệp vụ hơn (vd matching
queue depth, số connection Socket.IO hiện tại — đo bằng Prometheus metrics của Giai đoạn 6, đang
làm song song ở nhánh khác) cần cài `prometheus-adapter` để expose Custom/External Metrics API cho
HPA dùng `type: Pods` hoặc `type: External`. Không tự bịa cấu hình `prometheus-adapter` ở đây vì
chưa có metric thật để kiểm chứng tên/label/ngưỡng.

Cập nhật 2026-10-17: gateway nay xuất `signaling_connections_active` (UpDownCounter, OTLP → Prometheus),
cùng `signaling_fanout_subscribed_users`, `signaling_tracked_leases`, `signaling_relay_events_total{result}`,
`signaling_lease_refresh_total{result}`; matcher xuất `matching_matcher_windows_total{outcome}`. Tên metric
đã có để làm nguồn cho `prometheus-adapter` nhưng **cấu hình adapter/HPA vẫn chưa làm** (chưa kiểm chứng
trên cụm thật). Gateway admission mặc định giới hạn 2.000 socket đã xác thực + đang chờ/process
(`WS_MAX_CONNECTIONS_PER_PROCESS`) và 64 handshake bất đồng bộ/process (`WS_MAX_CONCURRENT_HANDSHAKES`),
không có hàng chờ; quá tải dùng lỗi retryable `CONNECTION_QUOTA_UNAVAILABLE`. Các gauge
`signaling_connections_reserved` và `signaling_handshakes_inflight` phản ánh cả tải đang admission.
Các ngưỡng này chưa phải capacity đã đo. Suy ra số replica cần thiết từ socket/process bền vững
đã benchmark và headroom khi mất pod/rollout; `maxReplicas` chỉ là giới hạn autoscale.
Tăng trần chỉ khi có số đo và cài/kiểm chứng Custom Metrics adapter; chia Redis theo userId
(`REALTIME_REDIS_URLS`, đặt trong Secret của cả core-api và signaling-gateway) trước khi tăng pod.
`REDIS_URL` của Socket.IO cluster adapter vẫn là dependency HA chung cho bootstrap/readiness,
kể cả khi quota/fanout đã chia shard — xem
`docs/services/realtime-gateway.md` § 7 và `docs/plans/2026-10-17-realtime-matching-chat-scale-plan.md` § 7.

## Ngân sách kết nối Postgres

HTTP có admission cap theo pod: `HTTP_MAX_CONCURRENT_REQUESTS=0` suy ra `4 × DATABASE_POOL_MAX`
(mặc định 40 handler đang xử lý). Hết chỗ trả 503 + `Retry-After: 1` trước khi chạy handler,
không tạo thêm hàng chờ ứng dụng; probe health được miễn để tránh vòng lặp rollout khi quá tải.
Slot được nhả khi request hoàn tất/lỗi hoặc Observable bị hủy. Guard/middleware phía trước
interceptor vẫn cần ingress/rate limit; đây không phải trần tổng kết nối TCP hay mọi tác vụ nền.
Probe health không dùng shared request throttle: các kubelet/proxy có thể chung IP khi số pod tăng.
Readiness coalesce probe theo process, cache kết quả một giây và chỉ giữ tối đa một SQL probe
chưa hoàn tất, kể cả khi HTTP probe đã hết hạn; tránh vòng lặp 429 hoặc làm đầy pool do probe chậm.

Runtime đặt `DATABASE_STATEMENT_TIMEOUT_MS=15000`: PostgreSQL hủy mỗi SQL quá hạn, kể cả khi
đang chờ row lock; transaction bị lỗi phải rollback. Pool vẫn có acquire timeout riêng
`DATABASE_POOL_ACQUIRE_TIMEOUT_MS`. Hai giới hạn này áp dụng cho API và các worker dùng runtime
DataSource; không phải deadline tổng của toàn bộ request. Migration CLI dùng DataSource riêng,
không kế thừa statement timeout của runtime để tránh ngắt DDL/index build dài. Theo dõi query bị
hủy và chỉnh cấu hình sau khi đo tải; không tăng pool hoặc timeout để che truy vấn nghẽn.

Core API/gateway ưu tiên trải replica theo node và zone bằng `ScheduleAnyway`. Quy tắc này giúp
scheduler phân tán khi có nhiều failure domain, vẫn cho alpha một node chạy được; không bảo đảm
HA nếu cluster chỉ có một node/zone hoặc không có đủ tài nguyên. Cần kiểm chứng placement và
node/zone failure trên cluster thật trước khi gọi deployment là HA.

Mỗi pod core-api giữ tối đa `DATABASE_POOL_MAX` kết nối tới Postgres (mặc định 10, sàn 5). Hai điều cần nhớ:

- Mỗi job nền singleton (`ManagedInterval` với `clusterSingleton`, hiện có hơn 10 job) giữ 1 kết nối cho
  advisory lock suốt lúc chạy, và task của nó cần thêm 1 kết nối nữa. Pool quá nhỏ có thể bị job tự chiếm
  hết, vì vậy có sàn 5 và `DATABASE_POOL_ACQUIRE_TIMEOUT_MS` (mặc định 10 giây): hết hạn thì request/job
  lỗi thay vì chờ vô hạn (driver pg mặc định không có timeout).
- Job retention (6 job: thông báo, auth, ghép đôi, economy, short-video, mood) chung `RETENTION_INTERVAL_MS`, nên mỗi job
  bắt đầu lệch một khoảng tất định theo hash của TÊN job (0 – 1 chu kỳ) để không đồng loạt chiếm kết nối lúc khởi động.
  Khi có backlog mỗi tick chạy tới 30 giây, nhưng ngân sách đồng thời dùng chung `RETENTION_MAX_CONCURRENT_JOBS` (mặc định 2) chặn
  tick thứ ba (bị bỏ trước khi lấy kết nối, thử lại chu kỳ sau): retention giữ ≤ 2 × 2 kết nối pool (cộng story sweeper, không
  thuộc ngân sách này). Đặt `DATABASE_POOL_MAX` đủ cho phần đó.
- Tổng kết nối ≈ số pod tối đa (kể cả pod surge lúc rollout) × `DATABASE_POOL_MAX` + migration/công cụ
  vận hành. Ví dụ: base `maxReplicas: 10` + `maxSurge: 1` = 11 pod × 10 = 110; overlay production và
  production-region-b `maxReplicas: 15` → 16 × 10 = 160. Postgres mặc định `max_connections = 100` và dành 3
  cho superuser (`superuser_reserved_connections`), chỉ còn 97 cho ứng dụng: với cấu hình mặc định, HPA có
  thể chạm giới hạn kết nối trước khi đạt `maxReplicas`.

Trước khi nâng `maxReplicas`:

1. Lấy `max_connections` thật của managed Postgres, trừ phần cho superuser, migration, admin và client khác.
2. Chọn `DATABASE_POOL_MAX` (không dưới 5) sao cho `(maxReplicas + maxSurge) × DATABASE_POOL_MAX` nằm
   dưới phần còn lại, hoặc nâng `max_connections` của plan Postgres.
3. Nếu vẫn không đủ, đặt PgBouncer ở giữa. Các advisory lock trong code đều là mức transaction
   (`pg_advisory_xact_lock`, `pg_try_advisory_xact_lock`) nên không phụ thuộc session; việc chạy
   qua PgBouncer thật chưa được kiểm chứng trong repo, cần thử trên staging trước.

## Rate limit dùng chung giữa các pod

`@nestjs/throttler` mặc định đếm trong bộ nhớ từng process: với N replica hạn mức thực tế gấp N lần
và bị reset mỗi lần deploy. `k8s/base/core-api/configmap.yaml` đặt `THROTTLE_STORAGE: 'redis'` để mọi
pod dùng chung bộ đếm (1 lệnh Redis mỗi request). Redis lỗi thì pod tạm dùng bộ đếm trong bộ nhớ
của chính nó và thử lại Redis sau vài giây, request không bị lỗi. Profile một pod hoặc Redis có hạn
mức lệnh thấp (hosted-free) giữ `memory`.

Bộ đếm khoá theo `req.ip` nên `HTTP_TRUST_PROXY_HOPS` phải đúng số proxy tin cậy (base đặt `'1'` cho
nginx-ingress). Nếu để `0` sau ingress thì `req.ip` là IP của proxy và MỌI người dùng đi qua cùng một
proxy chia chung MỘT bucket cho mỗi route; core-api ghi cảnh báo lúc boot khi gặp tổ hợp redis + production

- hops 0. Quota guest theo mạng cũng dùng `req.ip`, nên giá trị này ảnh hưởng cả hai.

## media-server (LiveKit) — nhiều node production, không có HPA

Đọc kỹ `docs/03-architecture.md § 3.5` trước khi đổi phần này:

- Multi-node LiveKit self-host dùng Redis để **chọn node host room mới** và scale theo **số
  room**, nhưng **một room vẫn phải nằm vừa trên một node** — thêm node không tự chia nhỏ một
  room đang chạy. Đây không phải giới hạn của manifest này mà là giới hạn kiến trúc LiveKit
  self-host hiện hành (ADR 0001 + đính chính 2026-07-13).
- Ở tầng networking, RTC dùng dải UDP `50000-50200` — Kubernetes `Service` (ClusterIP hay
  LoadBalancer chuẩn) không dễ dàng share một dải port lớn như vậy cho **nhiều pod cùng lúc**, vì
  mỗi pod LiveKit cần "sở hữu" trọn dải port đó để client map đúng candidate ICE tới đúng pod.
  **ĐÃ CHỐT ([ADR 0005](../docs/adr/0005-livekit-hostnetwork-rtc.md))**: `hostNetwork: true` +
  `dnsPolicy: ClusterFirstWithHostNet` (đã bật trong `base/media-server/deployment.yaml`).
  Đánh đổi chấp nhận: mất cô lập network namespace, port `7880/7881/50000-50200` phải trống trên
  Node, tối đa 1 pod media-server / Node; firewall Node phải mở dải UDP cho client (điều kiện hạ
  tầng lúc deploy thật). Phương án NodePort per-pod bị loại (cần cơ chế gán/khám phá port động
  chưa có trong repo — lý do đầy đủ trong ADR).
- Base/dev/staging giữ `replicas: 1`; production và production-region-b khai hai replica
  trên hai hostname khác nhau nhằm giảm phạm vi lỗi node và drain từng pod. Đây là cấu hình
  sẵn sàng triển khai, chưa phải bằng chứng capacity. Không có HPA cho media. Cần ít nhất hai
  node đủ resource, cổng RTC/metrics trống, địa chỉ ICE công khai đúng và firewall phù hợp;
  thiếu node thứ hai thì pod phải Pending, không được bỏ anti-affinity để ép cùng node.
  Cả hai pod dùng chung Redis LiveKit, cùng credentials và endpoint client/control đúng.
  Một room vẫn vừa một node và không migrate khi crash; phải benchmark
  `loadtest/party-room-livekit.sh` theo publishers/subscribers/codec/bitrate trước triển khai thật.
  Region B vẫn là scaffold chưa provision.
- `LIVEKIT_URL` của core-api trỏ `Service` ClusterIP `media-server.litmatch.svc.cluster.local:7880`
  — dùng được cho core-api gọi **control API** (mint token, tạo/xoá room) trong cluster. Đường
  client **kết nối trực tiếp RTC** (docs/03 § 3.7: "client nối thẳng LiveKit bằng token TTL ngắn")
  đi qua IP Node nhờ `hostNetwork` (ADR 0005); URL client nhận được resolve theo region qua
  `LIVEKIT_REGION_URLS` của core-api (fallback `LIVEKIT_URL`) — mọi URL trong map phải cùng
  **một** cụm LiveKit (chung Redis room state).
- **LiveKit keys (`keys:` block trong `livekit.yaml`) hiện phải nằm trong nội dung file config**
  (không có cơ chế tách "keys từ Secret riêng" đã kiểm chứng ở version `v1.13.1` đang dùng) —
  `base/media-server/configmap.yaml` chỉ có placeholder `REPLACE_ME_KEY`/`REPLACE_ME_SECRET`,
  PHẢI được thay bằng giá trị thật (khớp `LIVEKIT_API_KEY`/`LIVEKIT_API_SECRET` trong
  `core-api/secret.yaml`) lúc deploy qua pipeline sinh ConfigMap từ template + secret store, không
  commit bản đã điền giá trị thật vào git. Đây là một hạn chế đã biết, không phải sai sót.
- **Health probe của media-server dùng `httpGet: path: /` trên cổng 7880** vì LiveKit không có
  controller `/health/live` theo hợp đồng riêng của NestJS apps trong repo này — đây là giả định
  CHƯA kiểm chứng chi tiết (response code/body thật của LiveKit `v1.13.1` khi healthy) trong môi
  trường k8s thật, cần xác nhận khi triển khai thật.

## Multi-region — vận hành khi có ngân sách

**Trạng thái thật (2026-07-13): TOÀN BỘ mục này là scaffolding CHƯA PROVISION.** Chỉ có MỘT
cluster/region thật; chưa có cluster thứ hai, chưa có domain nào delegate về Cloudflare, chưa có
Load Balancer nào được tạo. Mọi thứ dưới đây tồn tại để đi live NHANH khi có ngân sách cho region
thứ hai — không phải mô tả một hệ đang chạy.

Routing traffic tới region gần nhất **ĐÃ CHỐT: Cloudflare Load Balancing (geo-steering)** —
[ADR 0006](../docs/adr/0006-cloudflare-global-routing.md). Lý do tóm tắt: cloud-agnostic (không
trói compute-hosting của từng region vào AWS/GCP/Azure như global LB cloud-native), add-on giá
mềm trên nền DNS/proxy Cloudflare, không phải tự vận hành GeoDNS. ADR 0006 **không** chọn
compute provider cho cluster của bất kỳ region nào — việc đó vẫn mở per-region.

### Runbook kích hoạt (khi có ngân sách region thứ hai)

1. **Cloudflare**: add domain production vào Cloudflare (delegate nameserver), bật Load
   Balancing add-on. Tạo 1 LB per hostname public (core-api, signaling-gateway) với policy
   **geo-steering**; mỗi region là một **pool**, origin = IP public của nginx-ingress region đó.
   Health check của pool: HTTP tới `/health/ready` (đã có sẵn ở cả core-api lẫn
   signaling-gateway, `@Public()` + `@SkipThrottle()`, trả 503 khi Postgres/Redis chưa sẵn
   sàng), **kèm `Host` header đúng hostname app** — origin chỉ là IP Ingress, thiếu Host thì
   nginx không route tới đúng Service.
2. **Real client IP**: apply `k8s/ingress-nginx/cloudflare-real-ip-configmap.yaml` vào MỖI
   cluster (đổi tên/namespace nếu controller cài khác chuẩn; sync dải IP từ
   <https://www.cloudflare.com/ips/> lúc apply). Không làm bước này thì rate-limit/audit/log
   theo IP client sai (thấy toàn IP Cloudflare).
3. **Dựng region mới**: copy pattern `k8s/overlays/production-region-b/` — đổi tên thư mục +
   region code + LiveKit URL theo market thật (xem chú thích trong
   `production-region-b/core-api-configmap-patch.yaml`; `REGION_B` là **placeholder có chủ
   đích**, chưa có market thứ hai nào được chốt về business). Tune replica/resource theo node
   thật của region. Mỗi region là một cluster riêng với namespace `litmatch` riêng (cùng nguyên
   tắc staging/production ở trên) — không nhét nhiều region vào 1 cluster bằng namespace.
4. **Đồng bộ map region**: khi bật multi-region, `LIVEKIT_REGION_URLS` (map ĐẦY ĐỦ region → URL
   edge) phải giống nhau ở MỌI region — overlay `production` (region A) cũng cần patch ConfigMap
   tương tự lúc đó (base giữ `''` = single-region, hành vi hôm nay không đổi). Bất biến ADR
   0005: mọi URL trong map cùng MỘT cụm LiveKit (chung Redis); media-server region mới join cụm
   hiện hữu, không dựng cụm riêng. Override thêm `KAFKA_BROKERS`/`DATABASE_URL`/`REDIS_URL`
   (Secret) nếu hạ tầng managed tách theo region.
5. **TLS**: vẫn là follow-on của ADR 0004 (chưa khai `tls:` trong Ingress) — phải chốt trước khi
   mở traffic công khai, độc lập với việc thêm region.

## Điểm mở cần chủ thread xác nhận lại

1. ~~API Gateway~~ — **ĐÃ CHỐT: nginx-ingress controller**
   ([ADR 0004](../docs/adr/0004-api-gateway-nginx-ingress.md)); còn follow-on TLS/cert-manager
   (chưa khai `tls:` trong Ingress).
2. ~~Networking RTC multi-node LiveKit~~ — **ĐÃ CHỐT: `hostNetwork: true`**
   ([ADR 0005](../docs/adr/0005-livekit-hostnetwork-rtc.md)); production overlays có hai
   replica để giảm phạm vi lỗi, vẫn cần benchmark và kiểm chứng network/drain trước deploy.
3. Công cụ quản lý Secret cụ thể cho cluster thật (sealed-secrets vs external-secrets/Vault) —
   chưa chốt, chỉ khai tên key cần điền.
4. HPA theo custom metric (Prometheus + `prometheus-adapter`) — follow-up, chưa làm ở PR này.
5. `KAFKA_BROKERS`/credential Kafka nếu production bật SASL — `env.validation.ts` hiện chưa có
   biến riêng cho credential Kafka, cần bổ sung khi cần (ngoài phạm vi PR này vì không được sửa
   code `.ts`).
6. Metrics của `core-api`/`signaling-gateway` push trực tiếp bằng OTel OTLP khi Secret/ConfigMap
   khai báo `GRAFANA_CLOUD_PROMETHEUS_URL`, `GRAFANA_CLOUD_PROMETHEUS_USER` và
   `GRAFANA_CLOUD_API_TOKEN`; không dùng annotation scrape `/metrics`. LiveKit vẫn dùng
   Prometheus port riêng.
7. ~~Global routing đa region~~ — **ĐÃ CHỐT: Cloudflare Load Balancing geo-steering**
   ([ADR 0006](../docs/adr/0006-cloudflare-global-routing.md)); scaffold overlay
   `production-region-b` + ConfigMap real-IP đã có, nhưng **chưa provision gì thật** (chưa có
   cluster thứ hai, chưa có domain trên Cloudflare) — xem mục Multi-region ở trên. Còn follow-on
   TLS/cert-manager (ADR 0004 § Hệ quả) trước khi mở traffic công khai.
