## Review — zero-cost production capability profile — plan — 2026-07-18

### 1. Objective và flow

Triển khai lựa chọn “production 0 đồng an toàn”: chạy `NODE_ENV=production`, giữ toàn bộ
capability tự host (Web, Admin, Core API, PostgreSQL, Redis, Kafka, Socket.IO, LiveKit, in-app
notification, analytics/observability), đồng thời fail-closed các capability cần adapter/vendor
chưa có là phone OTP, video upload/transcode, store IAP và external push.

Flow cấu hình:

`deploy/production/.env → schema validate → module chọn provider dev/store/disabled → service chặn trước
side effect → API trả domain error rõ → frontend ẩn CTA không khả dụng`

Flow đăng nhập production miễn phí:

`Google Identity SDK → POST /auth/social → server verify issuer/signature/audience → issue JWT →
operator promote user đầu tiên thành admin bằng runbook → Admin đăng nhập cùng Google identity`

### 2. Out of scope

- Không giả SMS, receipt, push hoặc URL video trong production.
- Không tự đăng ký/mua SMS, Apple Developer, Google Play hoặc video SaaS.
- Không thay ledger, transaction, IAP receipt schema hay migration lịch sử.
- Không biến profile miễn phí thành HA/SLA production; đây là single-node release có backup và
  rollback app, phù hợp alpha/beta ngân sách 0 đồng.

### 3. Bảng giả định

| #   | Giả định / invariant                                      | Ai/cách phá                                      | Chặn ở đâu dự kiến                                                                         | Verdict |
| --- | --------------------------------------------------------- | ------------------------------------------------ | ------------------------------------------------------------------------------------------ | ------- |
| 1   | Core phải boot bằng `NODE_ENV=production`                 | Dev provider lifecycle throw dù feature disabled | Provider bootstrap chỉ reject khi chính provider dev được chọn; boot smoke test            | ✅      |
| 2   | Phone OTP disabled không ghi OTP rồi mới lỗi              | Chặn tại SmsProvider sau `repo.save`             | `AuthService` assert capability trước `OtpService.requestOtp/verifyOtp`                    | ✅      |
| 3   | Video upload disabled không tạo row `uploading` mồ côi    | Chặn sau insert hoặc phát URL dev                | `ShortVideoService` assert trước create/finalize; dev port vẫn fail trong prod             | ✅      |
| 4   | IAP disabled không verify receipt giả và không ghi ledger | Dev verifier được chọn nhầm                      | `DisabledIapVerifier` trả domain error trước transaction/ledger                            | ✅      |
| 5   | Economy ngoài IAP vẫn hoạt động                           | Disable cả module Economy                        | Chỉ thay `IapVerifier`; wallet, gift, VIP bằng diamond, admin adjustment giữ nguyên        | ✅      |
| 6   | Push disabled không làm mất in-app notification           | No-op làm rollback transaction gốc               | `DisabledPushProvider` chỉ bỏ external side effect; notification row vẫn commit            | ✅      |
| 7   | Store webhook production không khởi tạo dev verifier      | Dev provider hook throw dù factory chọn store    | Hook dev kiểm tra đúng env selector; webhook verifier store vẫn fail-closed                | ✅      |
| 8   | Admin không bị khoá ngoài khi SMS tắt                     | Admin UI chỉ có form OTP                         | Google login dùng browser-auth primitive chung; server vẫn verify token                    | ✅      |
| 9   | User thường không thấy CTA chắc chắn thất bại             | Frontend không biết runtime profile              | Public build flags derive từ cùng deploy env và có test                                    | ✅      |
| 10  | Production không dùng secret/default dev                  | Compose có fallback dev                          | `deploy/production/.env.example` + preflight bắt required secret và reject known dev value | ✅      |
| 11  | LiveKit dùng public UDP, không đi qua HTTP tunnel         | Chỉ proxy WebSocket qua reverse proxy            | Public IP + TCP 7881 + UDP range trong Compose/firewall runbook                            | ✅      |
| 12  | Rollback app không đảo migration/ledger                   | Script chạy migration revert                     | Release chỉ migration forward; rollback đổi image tag, docs cảnh báo                       | ✅      |

### 4. Checklist boundary/correctness

- [x] Không thêm backend deployable thứ tư.
- [x] Disabled provider là adapter trong domain owner, không đưa business logic vào `common/`.
- [x] Chặn trước side effect/DB write ở Auth, Short Video và Economy.
- [x] Economy ledger append-only và idempotency contract không đổi.
- [x] Frontend không tự quyết quyền; backend role guard vẫn là chốt cuối.
- [x] Google ID token luôn được backend verify, client ID public không phải secret.
- [x] Single source deploy env sinh URL/CORS/build flags; Compose không có credential fallback.
- [x] Production DB/Redis/Kafka/metrics không expose Internet.
- [x] Release có migration forward, health gate, backup, smoke và app rollback.

### 5. Test bắt buộc sau implementation

- Unit: disabled/dev/store provider selection và không-side-effect khi disabled.
- Auth/Admin/Web behavior test: OTP CTA ẩn, Google login dùng đúng endpoint/session.
- Core production bootstrap smoke với profile disabled và PostgreSQL/Redis thật.
- Economy integration PostgreSQL thật, không cache.
- `docker compose config`, build image Web/Admin/Core/Signaling, runtime health smoke.
- `pnpm agent:verify core`, `frontend`, `signaling`, `media`, `infra`.
- `review-module verify` với bằng chứng file:line và kết quả thật.

### 6. Kết luận

**PASS (plan).** Có thể triển khai profile production subset theo hướng fail-closed. Nếu một
thay đổi buộc phải chấp nhận receipt/OTP/video giả trong production hoặc sửa ledger invariant,
phải dừng và lập quyết định mới.
