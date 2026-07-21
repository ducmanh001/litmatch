# 0009. Profile alpha hosted-free đa nhà cung cấp

- **Ngày**: 2026-07-22
- **Trạng thái**: Accepted
- **Liên quan**: docs/03-architecture.md § 3.9, docs/04-tech-stack.md,
  docs/runbooks/hosted-free-release.md, ADR 0001, ADR 0007, ADR 0008

## Bối cảnh

Profile ADR 0008 cần một máy public luôn bật, trái yêu cầu cloud-only và không dùng máy cá nhân.
Free tier hiện có vừa khít hai process Node và một PostgreSQL, nhưng không đủ tài nguyên để
self-host LiveKit. Frontend và Redis có free tier chuyên dụng, nên profile alpha có thể phân bổ
theo capability mà không tạo backend component thứ tư.

## Quyết định

- `core-api`, `signaling-gateway` và PostgreSQL chạy trong Northflank Developer Sandbox;
  hai service build Dockerfile portable trực tiếp từ Git.
- Admin SPA chạy Cloudflare Pages; Web Next.js SSR chạy Cloudflare Workers qua OpenNext; Redis
  chạy Upstash Free qua TLS `rediss://`.
- Media component vẫn là LiveKit, nhưng profile alpha vận hành bằng LiveKit Cloud Build thay cho
  binary self-host. `core-api` tiếp tục sở hữu token/grant và chỉ phụ thuộc LiveKit port hiện có.
- Kafka relay tắt; outbox vẫn append trong cùng DB transaction và giữ `published_at` null.
- GitHub Actions chỉ release đúng commit đã qua CI: migration forward-only trước, sau đó trigger
  hai Northflank build, deploy frontend và smoke public endpoint.

## Phương án đã loại & lý do

- Render/Koyeb free — service có thể ngủ hoặc số slot không đủ cho API + WebSocket always-on.
- Vercel Hobby — điều khoản Hobby không phù hợp khi ứng dụng chuyển sang mục đích thương mại.
- Self-host LiveKit trên service thứ ba — vượt hai slot miễn phí và cần public UDP/L4 networking.
- Chạy tất cả trên một VM miễn phí — phụ thuộc quota/cấp VM và quay lại mô hình một máy của ADR
  0008 thay vì hosted managed.

## Hệ quả

- Đây là demo/alpha không SLA. Hết quota sẽ fail/limit thay vì tự nâng plan; không gắn billing
  auto-upgrade. Upstash có thể archive free database sau thời gian không hoạt động.
- Cross-site browser auth bắt buộc `AUTH_COOKIE_SAME_SITE=none`, `Secure`, exact CORS allowlist và
  CSRF double-submit. Profile cùng site giữ default `strict`.
- Secret chỉ nằm trong Northflank/LiveKit/Cloudflare/GitHub Secrets, không nằm trong Git.
- Khi có traffic/SLA hoặc cần media self-host, quay lại Kubernetes/Compose hiện hành; profile này
  không thay baseline ba backend component hay quyết định scale của ADR 0001/0005.
