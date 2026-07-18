# Review — hosted-monitoring — verify — 2026-07-18

## 1. Phạm vi và flow thực tế

- Product analytics: trình duyệt khởi tạo PostHog ở trạng thái opt-out → người dùng chấp
  nhận/từ chối banner → chỉ khi chấp nhận mới capture page/action/session replay → khi có
  profile thì identify bằng UUID + nickname + loại tài khoản → logout/session hết hạn thì reset
  identity.
- System monitoring: `core-api`, `signaling-gateway`, `media-server` xuất `/metrics` và các
  container xuất structured log → Grafana Alloy scrape/collect → remote-write sang Grafana
  Cloud. Overlay observability là tùy chọn, không nằm trên đường phục vụ request.
- Ngoài phạm vi: tự xây dashboard tracking trong admin, fingerprinting, thu nội dung chat,
  input, token, OTP, số điện thoại hoặc tọa độ chính xác.

## 2. Assumption table và vị trí chặn

| Giả định                                          | Bằng chứng implementation                               | Vị trí chặn                                                                  | Kết quả |
| ------------------------------------------------- | ------------------------------------------------------- | ---------------------------------------------------------------------------- | ------- |
| Không gửi analytics trước consent                 | `apps/web/src/shared/analytics/product-analytics.ts:38` | `opt_out_capturing_by_default` và nhánh opt-out tại dòng 45–57               | PASS    |
| Chỉ identify tối thiểu sau consent                | `apps/web/src/shared/analytics/product-analytics.ts:89` | Guard consent dòng 93; payload chỉ UUID, nickname, account type dòng 94–97   | PASS    |
| Replay không thu input/nội dung text              | `apps/web/src/shared/analytics/product-analytics.ts:46` | `maskAllInputs` + `maskTextSelector: '*'`                                    | PASS    |
| Thiếu cấu hình thì analytics tắt hoàn toàn        | `apps/web/src/shared/analytics/product-analytics.ts:23` | Config nullable và return tại dòng 35                                        | PASS    |
| Token/host phải cấu hình cùng nhau                | `apps/web/src/shared/env.ts:27`                         | Zod refine dòng 27–35                                                        | PASS    |
| Logout không nối nhầm hai danh tính               | `apps/web/src/app/providers.tsx:30`                     | Reset PostHog khi token store chuyển `unauthenticated`, dòng 33–36           | PASS    |
| Log gửi ra ngoài đã che secret/PII nhạy cảm       | `libs/logger/src/lib/redact.ts:5`                       | Danh sách redact dùng chung cho auth, cookie, OTP, token, phone, location    | PASS    |
| Metrics/log labels không dùng user/request ID     | `observability/alloy/config.alloy:29`                   | Chỉ giữ `environment`, `service`, `level`; filter service cố định dòng 59–68 | PASS    |
| Hosted monitoring lỗi không làm app ngừng phục vụ | `docker-compose.observability.yml:1`                    | Alloy nằm trong compose overlay tùy chọn; app không phụ thuộc Alloy          | PASS    |
| Docker collector không lộ UI ra Internet          | `docker-compose.observability.yml:25`                   | Alloy UI chỉ bind `127.0.0.1`                                                | PASS    |

## 3. Checklist boundary/correctness

- [x] Không thêm backend deployable thứ tư; chỉ thêm collector trong optional infra overlay.
- [x] Product analytics chỉ ở `apps/web`, không chứa business rule.
- [x] Consent explicit, opt-out mặc định, replay mask toàn bộ input và text.
- [x] Không đưa access token, cookie, OTP, số điện thoại hoặc vị trí vào analytics identity.
- [x] Structured log dùng redaction tập trung trước khi Alloy chuyển tiếp.
- [x] Prometheus labels giữ cardinality thấp; không gắn user/request/session ID.
- [x] Hosted credentials chỉ đọc từ env và không có giá trị secret mặc định.
- [x] PostHog/Grafana đều là optional integration; tắt cấu hình không phá luồng sản phẩm.
- [x] Image Alloy pin cả version và digest.
- [x] Runbook ghi rõ quyền riêng tư, quota miễn phí và thao tác người vận hành.

## 4. Bằng chứng test thật

| Lệnh                                                                                                                | Kết quả                                                                       |
| ------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------- |
| `pnpm nx test web --skip-nx-cache`                                                                                  | PASS — 60 files, 219 tests                                                    |
| `pnpm nx lint web --skip-nx-cache`                                                                                  | PASS                                                                          |
| `pnpm nx build web --skip-nx-cache`                                                                                 | PASS — 19 static pages và các dynamic routes build thành công                 |
| `docker compose -f docker-compose.yml -f docker-compose.dev.yml -f docker-compose.observability.yml config --quiet` | PASS với bộ env giả lập đầy đủ                                                |
| `docker run --rm ... grafana/alloy:v1.17.1 validate /etc/alloy/config.alloy`                                        | PASS                                                                          |
| `pnpm agent:check`                                                                                                  | PASS — repository guard, 44 agent/CI tests, OpenAPI check                     |
| `pnpm agent:verify frontend --tier=fast`                                                                            | PASS — lint + 292 tests                                                       |
| `pnpm agent:verify frontend`                                                                                        | PASS — format, lint, 292 tests, production build, bundle budget 92.77/180 KiB |
| `git diff --check`                                                                                                  | PASS                                                                          |

Test privacy trực tiếp nằm tại
`apps/web/src/shared/analytics/product-analytics.spec.ts:27`: analytics vô hiệu khi thiếu config,
opt-out/masking mặc định, identify chỉ sau consent với payload tối thiểu, và reset khi hết session.

## 5. Kết luận

**PASS.** Luồng hosted monitoring đúng phạm vi, có consent và privacy boundary cụ thể, không
phá baseline ba backend deployable, không tạo coupling khiến outage bên thứ ba chặn sản phẩm,
và đã qua toàn bộ verify frontend của repository.
