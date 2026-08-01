import { NodeSDK } from '@opentelemetry/sdk-node';
import { getNodeAutoInstrumentations } from '@opentelemetry/auto-instrumentations-node';
import { OTLPMetricExporter } from '@opentelemetry/exporter-metrics-otlp-http';
import { OTLPLogExporter } from '@opentelemetry/exporter-logs-otlp-http';
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-http';
import { resourceFromAttributes } from '@opentelemetry/resources';
import { ATTR_SERVICE_NAME } from '@opentelemetry/semantic-conventions';

import { PeriodicExportingMetricReader } from '@opentelemetry/sdk-metrics';
import { BatchLogRecordProcessor } from '@opentelemetry/sdk-logs';

import type {
  PushMetricExporter,
  ResourceMetrics,
} from '@opentelemetry/sdk-metrics';

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
 * Opt-in tường minh: KHÔNG khởi động SDK nếu chưa cấu hình trace hoặc metrics endpoint — tránh
 * export lỗi âm thầm tới `localhost:4318` làm nhiễu log ở dev/test/CI chưa có collector thật.
 * Logs từ pino được chuyển qua OTel log pipeline và push thẳng tới Grafana Cloud Loki khi có
 * `GRAFANA_CLOUD_LOKI_URL`; metrics vẫn dùng OTLP HTTP push trực tiếp khi có
 * `GRAFANA_CLOUD_PROMETHEUS_URL`.
 */
export function startTracing(input: StartTracingInput): NodeSDK | null {
  const traceEndpoint =
    process.env['OTEL_EXPORTER_OTLP_ENDPOINT'] ??
    process.env['OTEL_EXPORTER_OTLP_TRACES_ENDPOINT'];
  const metricsEndpoint = resolveMetricsEndpoint();
  const logsEndpoint = resolveLogsEndpoint();
  assertRequiredTelemetry(traceEndpoint, metricsEndpoint, logsEndpoint);
  if (!traceEndpoint && !metricsEndpoint && !logsEndpoint) {
    console.warn(
      '[telemetry] OTLP exporters disabled: no trace, metrics, or Loki logs endpoint is configured',
    );
    return null;
  }

  const metricsExportInterval = resolveMetricsExportInterval();
  const metricsEndpointForLog = metricsEndpoint
    ? redactEndpoint(metricsEndpoint)
    : '<none>';
  if (metricsEndpoint) {
    console.info(
      `[metrics] OTLP exporter enabled service=${input.serviceName} endpoint=${metricsEndpointForLog} interval_ms=${metricsExportInterval}`,
    );
  }

  const metricReader = metricsEndpoint
    ? new PeriodicExportingMetricReader({
        exporter: createLoggingMetricExporter(
          new OTLPMetricExporter({
            url: metricsEndpoint,
            headers: resolveMetricsHeaders(),
          }),
          input.serviceName,
          metricsEndpointForLog,
        ),
        exportIntervalMillis: metricsExportInterval,
      })
    : undefined;

  const logRecordProcessor = logsEndpoint
    ? new BatchLogRecordProcessor({
        exporter: new OTLPLogExporter({
          url: logsEndpoint,
          headers: resolveLogsHeaders(),
        }),
      })
    : undefined;

  const sdk = new NodeSDK({
    resource: resourceFromAttributes({
      [ATTR_SERVICE_NAME]: input.serviceName,
    }),
    ...(traceEndpoint ? { traceExporter: new OTLPTraceExporter() } : {}),
    metricReaders: metricReader ? [metricReader] : [],
    logRecordProcessors: logRecordProcessor ? [logRecordProcessor] : [],
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

const DEFAULT_METRICS_EXPORT_INTERVAL_MS = 15_000;

/**
 * Production-like profiles set OBSERVABILITY_REQUIRED=true. Keeping this separate from
 * NODE_ENV lets local/hosted-free builds use production optimisations without pretending to
 * provide a production SLO. A required pipeline fails at boot instead of running silently blind.
 */
function assertRequiredTelemetry(
  traceEndpoint: string | undefined,
  metricsEndpoint: string | undefined,
  logsEndpoint: string | undefined,
): void {
  if (process.env['OBSERVABILITY_REQUIRED'] !== 'true') return;

  const missing: string[] = [];
  if (!traceEndpoint) missing.push('OTEL trace endpoint');
  if (!metricsEndpoint) missing.push('OTEL metrics endpoint');
  if (!logsEndpoint) missing.push('Loki OTLP logs endpoint');
  if (!process.env['GRAFANA_CLOUD_PROMETHEUS_USER'])
    missing.push('metrics user');
  if (!process.env['GRAFANA_CLOUD_LOKI_USER']) missing.push('logs user');
  if (!process.env['GRAFANA_CLOUD_API_TOKEN']) missing.push('metrics token');

  if (missing.length > 0) {
    throw new Error(
      `Production telemetry is required but incomplete: ${missing.join(', ')}`,
    );
  }
}

/**
 * Grafana's existing variable name is retained for deployment compatibility, but its value
 * must be the Grafana Cloud OTLP base/metrics URL, not the Prometheus remote_write URL.
 */
export function resolveMetricsEndpoint(): string | undefined {
  const configured =
    process.env['GRAFANA_CLOUD_PROMETHEUS_URL'] ??
    process.env['OTEL_EXPORTER_OTLP_METRICS_ENDPOINT'];
  if (!configured) return undefined;

  try {
    const url = new URL(configured);
    const pathname = url.pathname.replace(/\/+$/, '');
    if (pathname.endsWith('/api/prom/push')) {
      console.error(
        '[metrics] GRAFANA_CLOUD_PROMETHEUS_URL đang là Prometheus remote_write URL (/api/prom/push), cần thay bằng URL Grafana Cloud OpenTelemetry (/otlp hoặc /otlp/v1/metrics)',
      );
      return undefined;
    }
    if (pathname.endsWith('/otlp')) {
      url.pathname = `${pathname}/v1/metrics`;
    } else if (!pathname.endsWith('/v1/metrics')) {
      console.warn(
        '[metrics] GRAFANA_CLOUD_PROMETHEUS_URL nên là Grafana Cloud OTLP URL (/otlp hoặc /otlp/v1/metrics)',
      );
    }
    return url.toString();
  } catch (err) {
    console.error(
      `[metrics] OTLP exporter disabled: URL không hợp lệ (${String(err)})`,
    );
    return undefined;
  }
}

/** Resolve Grafana Cloud Loki's OTLP HTTP logs endpoint from the deployment URL. */
export function resolveLogsEndpoint(): string | undefined {
  const configured = process.env['GRAFANA_CLOUD_LOKI_URL'];
  if (!configured) return undefined;

  try {
    const url = new URL(configured);
    const pathname = url.pathname.replace(/\/+$/u, '');
    if (pathname.endsWith('/loki/api/v1/push')) {
      url.pathname =
        pathname.slice(0, -'/loki/api/v1/push'.length) + '/otlp/v1/logs';
    } else if (pathname.endsWith('/otlp')) {
      url.pathname = `${pathname}/v1/logs`;
    } else if (!pathname.endsWith('/otlp/v1/logs')) {
      url.pathname = `${pathname}/otlp/v1/logs`;
    }
    return url.toString();
  } catch (err) {
    console.error(
      `[logs] OTLP exporter disabled: Loki URL không hợp lệ (${String(err)})`,
    );
    return undefined;
  }
}

export function resolveLogsHeaders(): Record<string, string> {
  const username = process.env['GRAFANA_CLOUD_LOKI_USER'];
  const token = process.env['GRAFANA_CLOUD_API_TOKEN'];
  if (!username || !token) return {};

  return {
    Authorization: `Basic ${Buffer.from(`${username}:${token}`).toString(
      'base64',
    )}`,
  };
}

function resolveMetricsExportInterval(): number {
  const configured = Number(
    process.env['GRAFANA_CLOUD_METRICS_EXPORT_INTERVAL_MS'],
  );
  return Number.isFinite(configured) && configured >= 5_000
    ? configured
    : DEFAULT_METRICS_EXPORT_INTERVAL_MS;
}

export function resolveMetricsHeaders(): Record<string, string> {
  const username = process.env['GRAFANA_CLOUD_PROMETHEUS_USER'];
  const token = process.env['GRAFANA_CLOUD_API_TOKEN'];
  if (!username || !token) return {};

  return {
    Authorization: `Basic ${Buffer.from(`${username}:${token}`).toString(
      'base64',
    )}`,
  };
}

function createLoggingMetricExporter(
  exporter: PushMetricExporter,
  serviceName: string,
  endpoint: string,
): PushMetricExporter {
  return {
    export(metrics: ResourceMetrics, callback): void {
      try {
        exporter.export(metrics, (result) => {
          if (result.code === 0) {
            console.info(
              `[metrics] gửi thành công service=${serviceName} endpoint=${endpoint}`,
            );
          } else {
            console.error(
              `[metrics] gửi thất bại service=${serviceName} endpoint=${endpoint}: ${String(result.error ?? 'HTTP exporter returned failure')}`,
            );
          }
          callback(result);
        });
      } catch (err) {
        console.error(
          `[metrics] gửi thất bại service=${serviceName} endpoint=${endpoint}: ${String(err)}`,
        );
        callback({
          code: 1,
          error: err instanceof Error ? err : new Error(String(err)),
        });
      }
    },
    forceFlush: () => exporter.forceFlush(),
    shutdown: () => exporter.shutdown(),
  };
}

function redactEndpoint(endpoint: string): string {
  try {
    const url = new URL(endpoint);
    url.username = '';
    url.password = '';
    url.search = '';
    url.hash = '';
    return url.toString();
  } catch {
    return '<invalid-endpoint>';
  }
}
