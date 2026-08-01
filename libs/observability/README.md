# observability

OpenTelemetry Meter + HTTP request duration middleware dùng chung cho `core-api` và
`signaling-gateway`. `NodeSDK` đăng ký `PeriodicExportingMetricReader` với
`@opentelemetry/exporter-metrics-otlp-http` để push trực tiếp lên Grafana Cloud khi có
`GRAFANA_CLOUD_PROMETHEUS_URL`, và `BatchLogRecordProcessor` với
`@opentelemetry/exporter-logs-otlp-http` để đẩy log pino thẳng tới Loki khi có
`GRAFANA_CLOUD_LOKI_URL`; không cần `/metrics` hoặc Alloy cho hai app này. Metric riêng
theo domain (matching latency, call drop rate, transaction failure rate...) vẫn sống ngay trong
module sở hữu domain đó ở từng app — xem `docs/services/*` tương ứng.

## Building

Run `nx build observability` to build the library.

## Running unit tests

Run `nx test observability` to execute the unit tests via [Jest](https://jestjs.io).
