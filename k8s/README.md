# Litmatch — Kubernetes manifests

Đây là hạ tầng deploy cho **đúng baseline 3 deployable backend** theo `AGENTS.md` luật 1 và
`docs/03-architecture.md § 3.2`: `core-api`, `signaling-gateway`, `media-server` (LiveKit
self-host). Không có app/service thứ 4 ở đây.

## Tooling: plain YAML + kustomize (built-in kubectl) — không phải quyết định kiến trúc

Dùng **kustomize** (built-in trong `kubectl`, không cần cài thêm tool/Helm) chỉ để tổ chức và
tái sử dụng YAML giữa các môi trường (base + overlay patch) — đây là lựa chọn **công cụ expose
YAML**, không phải quyết định kiến trúc/ADR. Nếu sau này cần templating phức tạp hơn (Helm chart,
giá trị tham số hoá nhiều), đó vẫn chỉ là đổi công cụ tooling, không đụng tới boundary/baseline.

Không dùng Helm ở đây vì: chỉ 3 app, số lượng biến môi trường tuy nhiều (86 key core-api) nhưng
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
    production/                # patch replica/resource lớn hơn, image tag do CI ghi đè bằng git SHA
```

## Cách apply

```bash
# xem trước YAML sinh ra (không apply)
kubectl kustomize k8s/overlays/staging

# apply thật
kubectl apply -k k8s/overlays/staging
kubectl apply -k k8s/overlays/production
```

Đã build-test cả `k8s/base`, `k8s/overlays/staging`, `k8s/overlays/production` bằng
`kustomize build` (kustomize v4.5.4 qua `npx kustomize`) — không lỗi cú pháp, patch match đúng
target. **Lưu ý đã phát hiện lúc test**: với kustomize (ít nhất v4.5.4), một strategic-merge patch
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
capacity đang phục vụ. `media-server` dùng `strategy: Recreate` (xem lý do trong
`base/media-server/deployment.yaml`) — deploy media-server có downtime ngắn theo thiết kế, vì
1 room chỉ nằm trên 1 pod và replicas mặc định là 1.

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
- **ConfigMap của core-api liệt kê đủ 76/86 biến** trong `CoreApiEnv`
  (số cũ "74/84" trong bản trước đã lệch 1 so với thực tế — đã đối chiếu lại bằng script diff
  lúc thêm `LIVEKIT_REGION_URLS`: 86 = 76 ConfigMap + 10 Secret, 0 thiếu, 0 thừa)
  (`apps/core-api/src/config/env.validation.ts`) — 10 biến còn lại (credential/connection-string
  có thể chứa mật khẩu) nằm trong Secret manifest placeholder: `JWT_SECRET`, `AUTH_OTP_PEPPER`,
  `DATABASE_URL`, `REDIS_URL`, `ECONOMY_APPLE_SHARED_SECRET`, `ECONOMY_GOOGLE_SA_EMAIL`,
  `ECONOMY_GOOGLE_SA_PRIVATE_KEY`, `ECONOMY_APPLE_PRIVATE_KEY`, `LIVEKIT_API_KEY`,
  `LIVEKIT_API_SECRET`. Đã đối chiếu bằng script diff tự động giữa `env.validation.ts` và
  `configmap.yaml` lúc viết — 0 thiếu, 0 thừa. Nếu sửa `env.validation.ts` sau này, **phải** đối
  chiếu lại `configmap.yaml`/`secret.yaml` trong cùng thay đổi.
- **Secret manifest KHÔNG chứa giá trị thật** — mọi giá trị đều là chuỗi `'REPLACE_ME...'`. Điền
  giá trị thật qua sealed-secrets (kubeseal) hoặc external-secrets-operator (Vault) tuỳ hạ tầng
  cluster thật — công cụ quản lý secret cụ thể **chưa chốt** ở thay đổi này, chỉ khai đúng tên key
  cần có.

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

## media-server (LiveKit) — vì sao KHÔNG có HPA, vì sao replicas: 1

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
- `replicas: 1` **vẫn là mặc định, vẫn không có HorizontalPodAutoscaler** — ADR 0005 chỉ gỡ
  blocker _networking_ cho multi-node; trần "một room vừa một node" (per-room resource,
  `docs/03 § 3.8.A`) là trục khác và **chưa có benchmark thật** (`loadtest/party-room-livekit.sh`
  chưa từng chạy trên hạ tầng production — `docs/07-roadmap.md` mục 1). Tăng replica là quyết
  định riêng sau khi có số liệu.
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

## Multi-region (Giai đoạn 7) — pattern overlay theo region

Hiện tại repo chỉ có 2 overlay (`staging`, `production`) cho **một** cluster/region — CHƯA tồn tại
cluster/region thứ hai, và manifest này **không bịa** một region cụ thể nào. Khi region thứ hai
thật sự được dựng, cách thêm là:

1. Tạo `k8s/overlays/production-<region>/` bằng cách copy đúng **shape** của
   `k8s/overlays/production/kustomization.yaml` (resources trỏ `../../base` + danh sách patch +
   `images:` transformer).
2. Override giá trị ConfigMap đặc thù region qua patch (vd `LIVEKIT_URL` trỏ media-server của
   region đó, `LIVEKIT_REGION_URLS` — map đầy đủ region → URL edge, `KAFKA_BROKERS`/`REDIS_URL`
   nếu hạ tầng managed tách theo region) và image tag do CI ghi đè như production hiện tại.
3. Mỗi region là một cluster riêng với namespace `litmatch` riêng (cùng nguyên tắc
   staging/production ở trên) — không nhét nhiều region vào 1 cluster bằng namespace.

**Routing traffic tới region gần nhất (GeoDNS / anycast / global load balancer của một cloud
provider) là một quyết định RIÊNG, đang mở** — nó bị block bởi việc chọn nhà cung cấp cloud/DNS,
và repo này hiện **không commit vào AWS/GCP/Azure/bare-metal nào** (đã kiểm tra: manifest không
chứa annotation/resource đặc thù provider). Không tự mặc định một provider ở đây — xem "Điểm mở"
bên dưới.

## Điểm mở cần chủ thread xác nhận lại

1. ~~API Gateway~~ — **ĐÃ CHỐT: nginx-ingress controller**
   ([ADR 0004](../docs/adr/0004-api-gateway-nginx-ingress.md)); còn follow-on TLS/cert-manager
   (chưa khai `tls:` trong Ingress).
2. ~~Networking RTC multi-node LiveKit~~ — **ĐÃ CHỐT: `hostNetwork: true`**
   ([ADR 0005](../docs/adr/0005-livekit-hostnetwork-rtc.md)); tăng `media-server` lên nhiều
   replicas vẫn chờ benchmark thật (trần room-per-node là trục khác, xem ADR).
3. Công cụ quản lý Secret cụ thể cho cluster thật (sealed-secrets vs external-secrets/Vault) —
   chưa chốt, chỉ khai tên key cần điền.
4. HPA theo custom metric (Prometheus + `prometheus-adapter`) — follow-up, chưa làm ở PR này.
5. `KAFKA_BROKERS`/credential Kafka nếu production bật SASL — `env.validation.ts` hiện chưa có
   biến riêng cho credential Kafka, cần bổ sung khi cần (ngoài phạm vi PR này vì không được sửa
   code `.ts`).
6. Prometheus metrics (`libs/observability`, `*.metrics.ts`) đang được thêm song song ở nhánh
   khác trong cùng Giai đoạn 6 — khi endpoint `/metrics` (port/path cụ thể) ổn định, cần bổ sung
   `containerPort` tương ứng + annotation scrape (`prometheus.io/scrape`) hoặc `ServiceMonitor`
   (nếu cluster dùng Prometheus Operator) vào `k8s/base/core-api` và
   `k8s/base/signaling-gateway`. Chưa làm ở PR này vì port/path metrics chưa xác định lúc viết
   manifest này — tránh bịa annotation trỏ endpoint chưa tồn tại.
7. **Global routing đa region** (GeoDNS vs anycast vs global LB) + TLS/cert-manager + DNS — block
   bởi việc chọn nhà cung cấp cloud/DNS, chưa chốt (xem mục Multi-region ở trên và ADR 0004 § Hệ
   quả). Đây là quyết định con người phải chốt tiếp theo cho Giai đoạn 7, không tự mặc định.
