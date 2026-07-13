# 0004. API Gateway = nginx-ingress controller

- **Ngày**: 2026-07-13
- **Trạng thái**: Accepted
- **Liên quan**: [docs/04-tech-stack.md](../04-tech-stack.md), [docs/03-architecture.md § 3.2/3.7](../03-architecture.md), `k8s/README.md`, `k8s/base/core-api/ingress.yaml`, `k8s/base/signaling-gateway/ingress.yaml`

## Bối cảnh

Từ Giai đoạn 6, `k8s/` chỉ có `Service` ClusterIP cho `core-api`/`signaling-gateway` — chưa có
đường expose ra ngoài cluster, và [docs/04-tech-stack.md](../04-tech-stack.md) để mở "NestJS
custom gateway hoặc Kong". Giai đoạn 7 (multi-region) buộc phải chốt tầng edge trước khi bàn tới
routing giữa các region. Nhu cầu thật hiện tại chỉ gồm: routing L7 theo host/path, WebSocket
upgrade cho Socket.IO, sticky session cho transport polling (ghi chú sẵn ở
`k8s/base/signaling-gateway/service.yaml`) — auth (JWT guard) và rate-limit (ThrottlerGuard)
đã nằm trong app, không cần lớp API-management riêng.

## Quyết định

Dùng **nginx-ingress controller** (Ingress resource, `ingressClassName: nginx`) làm API gateway/
edge duy nhất để expose `core-api` và `signaling-gateway`. Không có tầng gateway tự viết nào
đứng giữa.

## Phương án đã loại & lý do

- **Kong** — giá trị chính là API-management (key management, plugin auth/rate-limit, dev portal)
  mà repo không có nhu cầu thật: auth/rate-limit đã enforce trong app; đổi lại phải vận hành thêm
  một hệ config/CRD/DB riêng.
- **NestJS custom gateway** — thành deployable backend thứ 4, vi phạm baseline 3 thành phần
  (`AGENTS.md` luật 1); không có business logic nào cần đứng ở edge nên chỉ là reverse proxy tự
  viết, kém nginx về độ chín/vận hành.

## Hệ quả

- `signaling-gateway`: Socket.IO transport polling cần sticky session —
  `k8s/base/signaling-gateway/ingress.yaml` khai `nginx.ingress.kubernetes.io/affinity: cookie`
  (+ nới proxy read/send timeout cho WebSocket dài hạn). Đây chính là điểm mở đã ghi chú ở
  `service.yaml` từ Giai đoạn 6, giờ chốt ở tầng Ingress; `Service.sessionAffinity` giữ `None`.
- Hostname trong Ingress là **placeholder** (convention `REPLACE_ME` của repo, viết dạng
  DNS-hợp-lệ) — điền hostname thật theo môi trường lúc deploy.
- **TLS/cert-manager là quyết định follow-on**, chưa chốt ở ADR này — Ingress hiện chưa khai
  `tls:`; production thật bắt buộc bổ sung trước khi mở traffic công khai.
- **DNS/global routing đa region** (GeoDNS, anycast, global load balancer của cloud provider) là
  quyết định riêng, bị block bởi việc chọn nhà cung cấp cloud/DNS — repo hiện KHÔNG commit vào
  AWS/GCP/Azure/bare-metal nào; ADR này chỉ chốt tầng edge TRONG một cluster.
- Điều kiện xem xét lại: khi xuất hiện nhu cầu API-management thật (partner API, plugin auth
  ngoài app, quota theo API key) thì cân nhắc lại Kong bằng ADR mới.
