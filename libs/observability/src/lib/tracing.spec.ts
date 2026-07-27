import { resolveMetricsEndpoint, startTracing } from './tracing';

describe('startTracing', () => {
  const ORIGINAL_ENV = process.env;

  beforeEach(() => {
    process.env = { ...ORIGINAL_ENV };
    delete process.env['OTEL_EXPORTER_OTLP_ENDPOINT'];
    delete process.env['OTEL_EXPORTER_OTLP_TRACES_ENDPOINT'];
    delete process.env['OTEL_EXPORTER_OTLP_METRICS_ENDPOINT'];
    delete process.env['GRAFANA_CLOUD_PROMETHEUS_URL'];
    delete process.env['GRAFANA_CLOUD_PROMETHEUS_USER'];
    delete process.env['GRAFANA_CLOUD_API_TOKEN'];
  });

  afterEach(() => {
    process.env = ORIGINAL_ENV;
  });

  it('chưa cấu hình OTEL_EXPORTER_OTLP_ENDPOINT → không khởi động SDK (trả null)', () => {
    expect(startTracing({ serviceName: 'core-api' })).toBeNull();
  });

  it('có OTEL_EXPORTER_OTLP_ENDPOINT → khởi động NodeSDK thật', async () => {
    process.env['OTEL_EXPORTER_OTLP_ENDPOINT'] = 'http://127.0.0.1:4318';
    const sdk = startTracing({ serviceName: 'core-api' });
    expect(sdk).not.toBeNull();
    await sdk?.shutdown();
  });

  it('OTEL_EXPORTER_OTLP_TRACES_ENDPOINT (riêng cho traces) cũng đủ để bật', async () => {
    process.env['OTEL_EXPORTER_OTLP_TRACES_ENDPOINT'] =
      'http://127.0.0.1:4318/v1/traces';
    const sdk = startTracing({ serviceName: 'signaling-gateway' });
    expect(sdk).not.toBeNull();
    await sdk?.shutdown();
  });

  it('GRAFANA_CLOUD_PROMETHEUS_URL dạng OTLP base được nối /v1/metrics', async () => {
    process.env['GRAFANA_CLOUD_PROMETHEUS_URL'] =
      'https://otlp-gateway-prod-us-east-0.grafana.net/otlp';

    expect(resolveMetricsEndpoint()).toBe(
      'https://otlp-gateway-prod-us-east-0.grafana.net/otlp/v1/metrics',
    );
    const sdk = startTracing({ serviceName: 'core-api' });
    expect(sdk).not.toBeNull();
    await sdk?.shutdown();
  });

  it('nhận diện Prometheus remote_write URL để log cảnh báo cấu hình', () => {
    process.env['GRAFANA_CLOUD_PROMETHEUS_URL'] =
      'https://prometheus-prod.grafana.net/api/prom/push';
    const errorSpy = jest
      .spyOn(console, 'error')
      .mockImplementation(() => undefined);

    expect(resolveMetricsEndpoint()).toContain('/api/prom/push');
    expect(errorSpy).toHaveBeenCalledWith(
      expect.stringContaining('Prometheus remote_write URL'),
    );
    errorSpy.mockRestore();
  });
});
