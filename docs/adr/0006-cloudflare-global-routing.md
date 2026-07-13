# 0006. Global routing đa region = Cloudflare Load Balancing (geo-steering)

- **Ngày**: 2026-07-13
- **Trạng thái**: Accepted
- **Liên quan**: [ADR 0004](./0004-api-gateway-nginx-ingress.md) § Hệ quả (điểm mở DNS/global
  routing), [ADR 0005](./0005-livekit-hostnetwork-rtc.md) (`LIVEKIT_REGION_URLS`),
  [docs/03-architecture.md § 3.2/3.7](../03-architecture.md), `k8s/README.md` mục Multi-region,
  `k8s/overlays/production-region-b/`, `k8s/ingress-nginx/cloudflare-real-ip-configmap.yaml`

## Bối cảnh

ADR 0004 chốt nginx-ingress làm edge **trong một cluster** và để mở quyết định "routing user tới
region gần nhất" (GeoDNS / anycast / global load balancer) vì chưa chọn nhà cung cấp cloud/DNS.
Đây là mảnh cuối của Giai đoạn 7 mục 5 (`docs/07-roadmap.md`). Ràng buộc quan trọng nhất: repo
**cố ý cloud-agnostic** — manifest k8s không chứa annotation/resource đặc thù provider nào, để
mỗi region có thể đặt trên bất kỳ hạ tầng nào rẻ nhất lúc đó (kể cả VPS budget provider). Quyết
định DNS/routing vì vậy không được kéo theo cam kết compute provider.

## Quyết định

Dùng **Cloudflare Load Balancing** với **geo-steering** làm tầng routing toàn cục khi có ≥2
region: domain delegate DNS về Cloudflare, mỗi region là một **pool** (origin = IP Ingress của
nginx-ingress region đó, health check HTTP vào endpoint `/health/ready` có sẵn của app), policy
steering theo vị trí địa lý của client. Khi chỉ có 1 region (hôm nay), Cloudflare chỉ là DNS/proxy
thường — không đổi hành vi gì.

## Phương án đã loại & lý do

- **Global LB cloud-native (AWS Global Accelerator / GCP Global HTTPS LB / Azure Front Door)** —
  mỗi cái đều kéo compute-hosting về đúng cloud đó (hoặc ít nhất trói tầng edge vào billing/IAM
  của họ), phá tính cloud-agnostic mà toàn bộ `k8s/` đã cố ý giữ; đắt hơn đáng kể ở quy mô nhỏ.
- **Tự xây GeoDNS (PowerDNS/BIND + GeoIP, hoặc route theo latency tự đo)** — reinvent một bài
  toán đã có lời giải rẻ và chín; thêm một hệ thống stateful phải tự vận hành đúng lúc đội đang
  tối ưu chi phí.

Cloudflare Load Balancing là add-on trả phí trên nền DNS/proxy miễn phí — mức giá thuộc loại
"affordable add-on", rẻ hơn nhiều so với dựng global LB ở hyperscaler (số cụ thể xem bảng giá
hiện hành của Cloudflare lúc kích hoạt, không ghi cứng vào đây).

## Hệ quả

- **Delegate DNS**: domain production phải chuyển nameserver về Cloudflare (điều kiện kích hoạt,
  chưa làm — chưa có domain thật trên Cloudflare).
- **Real client IP**: khi traffic đi qua proxy Cloudflare, nginx-ingress thấy IP của Cloudflare
  thay vì IP client — ảnh hưởng rate-limit/audit/log. Phải cấu hình ConfigMap của ingress-nginx
  controller: `use-forwarded-headers: "true"` + `forwarded-for-header: "CF-Connecting-IP"` +
  `proxy-real-ip-cidr: <dải IP Cloudflare>` (mặc định `proxy-real-ip-cidr` là `0.0.0.0/0` — tin
  mọi nguồn, KHÔNG được để mặc định khi bật forwarded headers). Manifest scaffold:
  `k8s/ingress-nginx/cloudflare-real-ip-configmap.yaml`; dải IP phải sync từ
  <https://www.cloudflare.com/ips/> lúc deploy và khi Cloudflare đổi dải.
- **Health check phải đi tới đúng app sau Ingress**: origin của pool là IP Ingress, health check
  cần gửi kèm `Host` header đúng hostname của app (core-api / signaling-gateway) và trỏ
  `/health/ready` (đã tồn tại ở cả hai app, `@Public()` + `@SkipThrottle()`).
- **ADR này KHÔNG chọn compute/hosting provider cho cluster k8s của bất kỳ region nào** — mỗi
  region vẫn tự do chọn hạ tầng rẻ nhất, độc lập với quyết định DNS này. Cũng không đổi bất biến
  ADR 0005: mọi URL trong `LIVEKIT_REGION_URLS` vẫn phải cùng MỘT cụm LiveKit (chung Redis).
- **Chưa provision gì thật**: chưa có cluster region thứ hai, chưa có domain trên Cloudflare,
  chưa có LB nào được tạo. Toàn bộ chỉ là quyết định + scaffold
  (`k8s/overlays/production-region-b/` là ví dụ cấu trúc với region code placeholder) để đi live
  nhanh khi có ngân sách — runbook ở `k8s/README.md` mục "Multi-region — vận hành khi có ngân
  sách".
- Điều kiện xem xét lại: nếu về sau toàn bộ các region đều nằm trên cùng một hyperscaler VÀ cần
  tính năng chỉ global LB của họ có (vd anycast tới tận TCP, private backbone), cân nhắc lại bằng
  ADR mới; hoặc nếu chính sách dữ liệu cấm proxy traffic qua bên thứ ba.
