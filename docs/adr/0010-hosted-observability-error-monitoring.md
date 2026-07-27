# 0010. Sentry Cloud cho lỗi, Grafana Cloud cho vận hành hosted

- **Ngày**: 2026-07-24
- **Trạng thái**: Accepted
- **Liên quan**: docs/04-tech-stack.md, docs/runbooks/grafana-cloud.md,
  docs/runbooks/hosted-free-release.md, ADR 0009

## Bối cảnh

Alpha cần nhìn thấy lỗi người dùng và server ngay từ đầu mà không tự vận hành một cluster ELK,
Prometheus hay collector thứ ba. Đồng thời repository đã có Prometheus + Pino + OpenTelemetry;
thêm một SDK tracing thứ hai sẽ tạo trace trùng, chi phí và nhiễu điều tra.

## Quyết định

- Sentry Cloud là error monitoring opt-in cho core-api, signaling-gateway, web và admin; SDK chỉ
  gửi exception, mặc định không gửi PII và `tracesSampleRate=0`.
- Grafana Cloud là nơi xem metrics/logs khi Compose/K8s chạy Alloy. Profile hosted-free của ADR 0009
  chỉ gửi OTel traces trực tiếp bằng endpoint/header chuẩn vì hai service Northflank không có slot
  collector hoặc Docker socket.
- Khi có SLA/traffic, chuyển metrics/logs hosted-free sang Alloy/collector managed hoặc Kubernetes;
  không thêm push-metrics riêng vào application.

## Phương án đã loại & lý do

- Sentry cho cả tracing — trùng OTel đang có, không mang thêm giá trị ở alpha.
- Self-host Grafana/Prometheus/Loki/Sentry — tốn vận hành và vượt resource/free-slot của profile.
- Bỏ error monitoring đến khi production — không có stack trace/release context khi lỗi auth hoặc
  deploy đầu tiên.

## Hệ quả

- Operator điền DSN và tạo alert ở Sentry; để trống DSN thì integration tắt không làm service fail.
- Sentry không nhận token/cookie/request body từ controlled exception boundary.
- Dashboard Grafana giữ metric/log labels low-cardinality hiện có; trace drill-down dùng service name
  `core-api` hoặc `signaling-gateway`.
