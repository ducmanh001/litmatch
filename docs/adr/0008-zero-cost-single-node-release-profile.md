# 0008. Profile release một máy chi phí 0

- **Ngày**: 2026-07-18
- **Trạng thái**: Accepted
- **Liên quan**: [docs/04-tech-stack.md](../04-tech-stack.md), [ADR 0004](./0004-api-gateway-nginx-ingress.md), `deploy/production/`

## Bối cảnh

Baseline Kubernetes là đích scale đúng, nhưng chủ sản phẩm cần phát hành alpha/beta với ngân
sách hạ tầng bằng 0. Các adapter SMS, store IAP, push và object storage/transcode hiện chưa có
nhà cung cấp production miễn phí đủ an toàn; dùng adapter dev trong production sẽ tạo dữ liệu
giả hoặc chấp nhận giao dịch không được verify.

## Quyết định

Bổ sung profile **single-node zero-cost** bằng Docker Compose trên một VM ARM64, Caddy làm TLS
reverse proxy, LiveKit self-host và Grafana/PostHog Cloud Free ở chế độ optional. Ba deployable
backend không đổi. Phone OTP, IAP, external push và video upload bị tắt fail-closed; Google OAuth,
guest, in-app notification và các capability self-host còn lại tiếp tục hoạt động.

Đây là profile alpha/beta có một failure domain, không thay thế Kubernetes/nginx-ingress khi hệ
thống cần HA hoặc scale ngang. Trong profile Kubernetes, ADR 0004 vẫn là quyết định edge hiện hành.

## Phương án đã loại & lý do

- **Chạy adapter dev dưới `NODE_ENV=production`** — tạo cảm giác tính năng hoạt động nhưng phá
  trust boundary của OTP/IAP và làm dữ liệu production không đáng tin.
- **Thêm backend service để proxy vendor miễn phí** — vi phạm baseline ba backend deployable và
  không giải quyết giới hạn/quyền riêng tư của vendor.
- **Kubernetes trên VM miễn phí duy nhất** — tốn tài nguyên vận hành nhưng không tạo HA thật vì
  mọi pod vẫn chung một máy.

## Hệ quả

- Cần backup PostgreSQL trước migration và rollback image; migration chỉ forward, không tự revert.
- VM hỏng sẽ gây downtime; media và database tranh tài nguyên trong giới hạn 2 OCPU/12 GB.
- Capability bị tắt phải được phản ánh đồng thời ở backend và frontend build-time env.
- Nâng lên multi-node/HA quay về K8s, nginx-ingress và LiveKit `hostNetwork` theo ADR 0004/0005.
