import {
  resolveMetricsEndpoint,
  resolveMetricsHeaders,
  resolveLogsEndpoint,
  resolveLogsHeaders,
  resolveTraceEndpoint,
  resolveTraceHeaders,
  startTracing,
} from './tracing';

describe('startTracing', () => {
  const ORIGINAL_ENV = process.env;

  beforeEach(() => {
    process.env = { ...ORIGINAL_ENV };
    delete process.env['OTEL_EXPORTER_OTLP_ENDPOINT'];
    delete process.env['OTEL_EXPORTER_OTLP_TRACES_ENDPOINT'];
    delete process.env['OTEL_EXPORTER_OTLP_METRICS_ENDPOINT'];
    delete process.env['GRAFANA_CLOUD_PROMETHEUS_URL'];
    delete process.env['GRAFANA_CLOUD_PROMETHEUS_USER'];
    delete process.env['GRAFANA_CLOUD_TEMPO_USER'];
    delete process.env['GRAFANA_CLOUD_LOKI_URL'];
    delete process.env['GRAFANA_CLOUD_LOKI_USER'];
    delete process.env['GRAFANA_CLOUD_API_TOKEN'];
    delete process.env['OBSERVABILITY_REQUIRED'];
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

  it('chuẩn hoá trace endpoint về /v1/traces và ưu tiên endpoint riêng của trace', () => {
    process.env['OTEL_EXPORTER_OTLP_ENDPOINT'] =
      'https://otlp.example.net/otlp/v1/metrics';
    process.env['OTEL_EXPORTER_OTLP_TRACES_ENDPOINT'] =
      'https://tempo.example.net/otlp/';

    expect(resolveTraceEndpoint()).toBe(
      'https://tempo.example.net/otlp/v1/traces',
    );
  });

  it('dựng trace Authorization Basic từ Tempo user, fallback sang Prometheus user', () => {
    process.env['GRAFANA_CLOUD_PROMETHEUS_USER'] = 'prom-user';
    process.env['GRAFANA_CLOUD_API_TOKEN'] = 'secret-token';
    process.env['GRAFANA_CLOUD_TEMPO_USER'] = '';
    expect(resolveTraceHeaders()).toEqual({
      Authorization: `Basic ${Buffer.from('prom-user:secret-token').toString(
        'base64',
      )}`,
    });

    process.env['GRAFANA_CLOUD_TEMPO_USER'] = 'tempo-user';
    expect(resolveTraceHeaders()).toEqual({
      Authorization: `Basic ${Buffer.from('tempo-user:secret-token').toString(
        'base64',
      )}`,
    });
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

  it('từ chối Prometheus remote_write URL để không gửi sai giao thức', () => {
    process.env['GRAFANA_CLOUD_PROMETHEUS_URL'] =
      'https://prometheus-prod.grafana.net/api/prom/push';
    const errorSpy = jest
      .spyOn(console, 'error')
      .mockImplementation(() => undefined);

    expect(resolveMetricsEndpoint()).toBeUndefined();
    expect(errorSpy).toHaveBeenCalledWith(
      expect.stringContaining('Prometheus remote_write URL'),
    );
    errorSpy.mockRestore();
  });

  it('tự dựng Authorization Basic từ username/token Grafana Cloud', () => {
    process.env['GRAFANA_CLOUD_PROMETHEUS_USER'] = '123456';
    process.env['GRAFANA_CLOUD_API_TOKEN'] = 'secret-token';

    expect(resolveMetricsHeaders()).toEqual({
      Authorization: `Basic ${Buffer.from('123456:secret-token').toString(
        'base64',
      )}`,
    });
  });

  it('chuẩn hoá Loki push URL thành OTLP logs endpoint', async () => {
    process.env['GRAFANA_CLOUD_LOKI_URL'] =
      'https://logs-prod.grafana.net/loki/api/v1/push';
    process.env['GRAFANA_CLOUD_LOKI_USER'] = 'logs-user';
    process.env['GRAFANA_CLOUD_API_TOKEN'] = 'secret-token';

    expect(resolveLogsEndpoint()).toBe(
      'https://logs-prod.grafana.net/otlp/v1/logs',
    );
    expect(resolveLogsHeaders()).toEqual({
      Authorization: `Basic ${Buffer.from('logs-user:secret-token').toString(
        'base64',
      )}`,
    });
    const sdk = startTracing({ serviceName: 'core-api' });
    expect(sdk).not.toBeNull();
    await sdk?.shutdown();
  });

  it('fail boot khi profile bắt buộc telemetry nhưng pipeline chưa đủ', () => {
    process.env['OBSERVABILITY_REQUIRED'] = 'true';

    const boot = () => startTracing({ serviceName: 'core-api' });
    expect(boot).toThrow('Production telemetry is required but incomplete');
    expect(boot).toThrow('trace user');
  });

  it('profile bắt buộc telemetry chỉ boot khi có trace, metrics và credential', async () => {
    process.env['OBSERVABILITY_REQUIRED'] = 'true';
    process.env['OTEL_EXPORTER_OTLP_ENDPOINT'] =
      'http://127.0.0.1:4318/v1/traces';
    process.env['GRAFANA_CLOUD_PROMETHEUS_URL'] =
      'http://127.0.0.1:4318/v1/metrics';
    process.env['GRAFANA_CLOUD_PROMETHEUS_USER'] = '123';
    process.env['GRAFANA_CLOUD_LOKI_URL'] =
      'http://127.0.0.1:4318/otlp/v1/logs';
    process.env['GRAFANA_CLOUD_LOKI_USER'] = 'logs-user';
    process.env['GRAFANA_CLOUD_API_TOKEN'] = 'token';

    const sdk = startTracing({ serviceName: 'core-api' });
    expect(sdk).not.toBeNull();
    await sdk?.shutdown();
  });
});
