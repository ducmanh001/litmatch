import { NodeSDK } from '@opentelemetry/sdk-node';
import { getNodeAutoInstrumentations } from '@opentelemetry/auto-instrumentations-node';
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-http';
import { resourceFromAttributes } from '@opentelemetry/resources';
import { ATTR_SERVICE_NAME } from '@opentelemetry/semantic-conventions';

export interface StartTracingInput {
  /** Tên service gắn vào resource attribute `service.name` — cố định theo app, không cấu hình. */
  serviceName: string;
}

/**
 * Bootstrap OpenTelemetry NodeSDK (docs/07 Giai đoạn 6 — distributed tracing Matching → Calling
 * → Economy). PHẢI được import/goi ở DÒNG ĐẦU TIÊN của `main.ts`, TRƯỚC mọi import khác — auto-
 * instrumentation (`http`, `pg`, `ioredis`, `express`...) hoạt động bằng cách hook vào
 * `require()`/`import` của Node NÊN phải đăng ký hook trước khi các module đó được require lần
 * đầu trong process (đây là ràng buộc kỹ thuật thật của OpenTelemetry JS, không phải quy ước tuỳ
 * chọn — xem README của `@opentelemetry/instrumentation`).
 *
 * Đọc thẳng `process.env` (KHÔNG qua `ConfigService`/Joi schema của app) vì hàm này chạy ở giai
 * đoạn TRƯỚC KHI Nest/ConfigModule khởi tạo. Biến `OTEL_EXPORTER_OTLP_ENDPOINT` là chuẩn env var
 * do chính OpenTelemetry spec định nghĩa (dùng chung mọi ngôn ngữ) — cố tình không bọc lại qua
 * Joi để không xung đột với cách chính SDK OTel tự đọc/parse biến này.
 *
 * Opt-in tường minh: KHÔNG khởi động SDK nếu chưa cấu hình endpoint — tránh export lỗi âm thầm
 * (retry mỗi vài giây tới `localhost:4318` không tồn tại) làm nhiễu log ở dev/test/CI chưa có
 * collector thật. Metrics/logs qua OTel bị tắt hẳn (`metricReaders`/`logRecordProcessors: []`) vì
 * repo đã chọn Prometheus (`prom-client`) cho metrics và pino cho log — tránh 2 pipeline chồng chéo.
 */
export function startTracing(input: StartTracingInput): NodeSDK | null {
  const endpoint =
    process.env['OTEL_EXPORTER_OTLP_ENDPOINT'] ??
    process.env['OTEL_EXPORTER_OTLP_TRACES_ENDPOINT'];
  if (!endpoint) return null;

  const sdk = new NodeSDK({
    resource: resourceFromAttributes({
      [ATTR_SERVICE_NAME]: input.serviceName,
    }),
    traceExporter: new OTLPTraceExporter(),
    metricReaders: [],
    logRecordProcessors: [],
    instrumentations: [
      getNodeAutoInstrumentations({
        // fs instrumentation cực ồn (mọi read/write file) — khuyến nghị chuẩn của OTel là tắt
        '@opentelemetry/instrumentation-fs': { enabled: false },
      }),
    ],
  });
  sdk.start();

  const shutdown = (): void => {
    sdk
      .shutdown()
      .catch((err: unknown) =>
        console.error(`OpenTelemetry shutdown lỗi: ${String(err)}`),
      );
  };
  process.once('SIGTERM', shutdown);
  process.once('SIGINT', shutdown);

  return sdk;
}
