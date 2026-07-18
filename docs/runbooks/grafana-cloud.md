# Grafana Cloud Free — metrics và structured logs

## Phần code đã làm sẵn

- `core-api` và `signaling-gateway` phơi Prometheus `/metrics`; LiveKit phơi cổng `6789`.
- HTTP latency/status, Node/process, matching wait, call end và Economy/reconciliation đã có metric.
- Pino ghi JSON kèm request ID; khi tracing bật còn có `trace_id`/`span_id`.
- `observability/alloy/config.alloy` scrape ba backend và tail Docker logs; chỉ label theo
  `environment`, `service`, `level` để tránh nổ cardinality/chi phí.
- `docker-compose.observability.yml` là overlay optional; không có credential thì stack chính
  không bị ảnh hưởng.

Grafana Cloud Free hiện không cần thẻ, giới hạn 10.000 active metric series, 50 GB log/tháng và
retention 14 ngày. Docker socket cho collector quyền đọc metadata/log container và tương đương
quyền root theo mô hình bảo mật Docker; chỉ bật Alloy trên host tin cậy.

## Phần chủ hệ thống cần làm một lần

1. Tạo Grafana Cloud Free tại <https://grafana.com/products/cloud/>.
2. Vào **Connections**, lấy Prometheus remote-write URL/user và Loki URL/user.
3. Tạo access policy token chỉ có `metrics:write` và `logs:write`.
4. Điền 6 biến `GRAFANA_CLOUD_*` cùng `DEPLOY_ENVIRONMENT` vào `.env` của host.
5. Chạy `pnpm observability:up`, rồi xem trạng thái collector tại
   `http://127.0.0.1:12345` hoặc `pnpm observability:logs`.
6. Trong Grafana Explore, kiểm tra metric `up`/`http_request_duration_seconds_count` và log query
   `{environment="development", service="core-api"}`.

## Dashboard/alert tối thiểu

Tạo dashboard với các PromQL sau (đổi cửa sổ nếu traffic thấp):

```promql
up{job=~"core-api|signaling-gateway|media-server"}

sum(rate(http_request_duration_seconds_count{status_code=~"5.."}[5m]))
/
clamp_min(sum(rate(http_request_duration_seconds_count[5m])), 0.001)

histogram_quantile(0.95,
  sum by (le, job) (rate(http_request_duration_seconds_bucket[5m])))

sum(rate(economy_transaction_total{result="failed"}[5m]))
/
clamp_min(sum(rate(economy_transaction_total[5m])), 0.001)

increase(economy_reconciliation_mismatch_total[15m])

histogram_quantile(0.95,
  sum by (le, matchType) (rate(matching_ticket_wait_seconds_bucket[10m])))
```

Alert ban đầu:

- `up == 0` trong 2 phút: service down.
- HTTP 5xx ratio > 5% trong 5 phút: lỗi ứng dụng.
- p95 HTTP > 2 giây trong 10 phút: latency cao.
- `increase(economy_reconciliation_mismatch_total[15m]) > 0`: lệch ledger — mức critical.
- `economy_reconciliation_last_run_status == 0`: đối soát lỗi/lệch — mức critical.

Log query phục vụ sự cố (không dùng request/user ID làm label):

```logql
{environment="production", service=~"core-api|signaling-gateway"} | json | level >= 50
```

Tra một request cụ thể bằng JSON content: thêm `|= "<traceId-or-requestId>"` vào query.
