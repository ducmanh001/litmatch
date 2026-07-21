## Review — hosted-free-release — plan — 2026-07-20

### 1. Phạm vi & luồng nghiệp vụ

Phạm vi là profile alpha/beta phân tán nhiều nhà cung cấp, không thay profile Compose/Kubernetes
và không tạo backend deployable thứ tư.

`CI main xanh → build frontend/backend từ đúng commit → migration PostgreSQL forward-only →
core-api ready → signaling ready → deploy web/admin → smoke HTTPS/WSS/LiveKit → ghi nhận release`

Out of scope: HA/SLA production, tự động nâng paid plan, store IAP/SMS/push/video transcoding thật,
và chuyển event fanout khỏi Kafka ở topology scale. Profile này giữ các capability cần vendor đó
ở trạng thái fail-closed như profile zero-cost hiện hành.

Acceptance criteria:

- Oracle không còn là điều kiện release duy nhất; có profile hosted dùng Docker/IaC portable.
- `core-api`, `signaling-gateway`, media LiveKit vẫn là đúng ba backend component về mặt
  architecture; managed LiveKit chỉ thay cách vận hành media component.
- Northflank PostgreSQL `postgresql://...sslmode=require`, Upstash `rediss://`, LiveKit Cloud `https/wss` boot được
  qua validation hiện hành và có test regression.
- Domain frontend/backend khác site vẫn rotate refresh token an toàn bằng cookie `Secure;
SameSite=None`, CORS allowlist và CSRF double-submit; profile cùng site tiếp tục mặc định
  `SameSite=Strict`.
- Alpha không cần Kafka đang bị ngừng cung cấp: relay tắt, event vẫn append vào outbox cùng DB
  transaction và không bị đánh dấu published.
- Không có secret/credential thật trong repo; deploy tự động mặc định tắt cho tới khi operator
  bật gate và cung cấp secret.

### 2. Bảng giả định

| #   | Giả định                                                  | Ai phá / cách phá                                                            | Chặn ở đâu                                                                                                                                         | Verdict                                                 |
| --- | --------------------------------------------------------- | ---------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------- |
| 1   | Free tier không tự sinh hóa đơn                           | Operator thêm thẻ, đổi plan hoặc bật auto-upgrade                            | IaC pin free plan; runbook yêu cầu không thêm payment method/không bật PAYG và chấp nhận suspend khi hết quota                                     | ✅ dự kiến                                              |
| 2   | Deploy chỉ lấy commit đã qua CI                           | Vendor auto-deploy trực tiếp mỗi push                                        | Northflank CI tự động tắt; workflow release chỉ trigger đúng SHA sau workflow CI thành công trên `main`                                            | ✅ dự kiến                                              |
| 3   | Cross-site refresh cookie vẫn được browser gửi            | Browser chặn `SameSite=Strict` giữa `pages.dev` và `onrender.com`            | Env policy tường minh `AUTH_COOKIE_SAME_SITE=none`; bắt buộc Secure, exact CORS allowlist và CsrfGuard                                             | ✅ dự kiến                                              |
| 4   | Redis managed bắt buộc TLS vẫn kết nối được               | Joi từ chối `rediss://` trước bootstrap                                      | Cả core và signaling chấp nhận đúng hai scheme `redis                                                                                              | rediss`; test từ chối scheme khác                       | ✅ dự kiến |
| 5   | Không Kafka không làm sai tiền hoặc mất event             | Relay vô tình bật với broker rỗng, hoặc code coi publish là commit nghiệp vụ | `ECONOMY_OUTBOX_RELAY_ENABLED=false`; ledger + outbox vẫn atomic trong Postgres, `published_at` để null cho replay khi có broker tương lai         | ✅ đã có, cần verify                                    |
| 6   | Schema tương thích trước khi app mới nhận traffic         | Migration lỗi hoặc hai release chạy chồng                                    | Container core chạy TypeORM migration fail-fast rồi mới `exec node main.js`; provider serialize deploy; migration forward-only/backward-compatible | ✅ dự kiến                                              |
| 7   | Managed LiveKit không làm lộ secret hoặc đổi quyền domain | Client tự chọn room/grant hay thấy API secret                                | Core vẫn mint token và gọi server API qua port hiện có; frontend chỉ nhận URL WSS + token TTL ngắn                                                 | ✅ đã có, cần verify                                    |
| 8   | Một vendor hết quota không làm mất source of truth        | Northflank/Upstash/LiveKit suspend hoặc restart                              | PostgreSQL Northflank giữ ledger/outbox; Redis chỉ là queue/cache/realtime, runbook ghi degradation và restore path                                | ⚠️ alpha chấp nhận downtime, không chấp nhận mất ledger |
| 9   | Hai service miễn phí đủ tài nguyên cho alpha              | Core hoặc signaling vượt RAM/CPU Sandbox                                     | Health/readiness + giới hạn alpha; đo thực tế sau release và không diễn giải thành SLA production                                                  | ⚠️ cần đo sau release                                   |

### 3. Checklist áp dụng

| Mục                                  | Kết quả            | Ghi chú                                                                        |
| ------------------------------------ | ------------------ | ------------------------------------------------------------------------------ |
| Baseline ba backend deployable       | Dự kiến PASS       | Không thêm app/service business; LiveKit Cloud là media component hiện có      |
| Economy ledger/idempotency/atomicity | Dự kiến PASS       | Không sửa ledger write path/schema; outbox tiếp tục ghi cùng transaction       |
| Security/secret/CORS/CSRF            | Cần code + test    | Thêm policy SameSite production tường minh, không dùng wildcard                |
| Failure isolation/rollback           | Cần code + runbook | Migration fail-fast; vendor deploy rollback image, schema chỉ forward          |
| Portability/no vendor lock-in        | Cần code           | Dockerfile PaaS từ Git; env contract không import SDK provider vào domain      |
| Observability                        | Dự kiến PASS       | Giữ health/ready, structured logs và metrics hiện có; free vendor không có SLA |
| Billing guard                        | Cần runbook + IaC  | Pin free, gate release mặc định off, không có resource PAYG                    |

### 4. Test dự kiến chạy

- Unit: env validation `rediss`, cookie policy `strict|none`, hosted release config/preflight.
- Build: `core-api`, `signaling-gateway`, `web` qua OpenNext Cloudflare, `admin` static.
- Container: build hai PaaS Dockerfile; core migration fail thì app không start.
- Scope: `pnpm agent:verify infra`, `pnpm agent:verify frontend`,
  `pnpm agent:verify economy --skip-nx-cache` và integration PostgreSQL thật theo `AGENTS.md`.
- Repository: `pnpm agent:check`, format/lint/test/build áp dụng.

### 5. Kết luận: PASS

Plan đủ chốt để hiện thực. Hai cảnh báo là giới hạn vận hành alpha, không được diễn giải thành
production SLA; runbook phải ghi ngưỡng/quota và phương án provider fallback rõ ràng.
