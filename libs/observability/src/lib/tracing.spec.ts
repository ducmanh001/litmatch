import { startTracing } from './tracing';

describe('startTracing', () => {
  const ORIGINAL_ENV = process.env;

  beforeEach(() => {
    process.env = { ...ORIGINAL_ENV };
    delete process.env['OTEL_EXPORTER_OTLP_ENDPOINT'];
    delete process.env['OTEL_EXPORTER_OTLP_TRACES_ENDPOINT'];
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
});
