import { createMetricsRegistry } from './metrics-registry';

describe('createMetricsRegistry', () => {
  it('gắn nhãn app vào metric + có sẵn default metrics (process/nodejs)', async () => {
    const registry = createMetricsRegistry({ appName: 'core-api' });
    const text = await registry.metrics();

    expect(text).toContain('app="core-api"');
    // collectDefaultMetrics đăng ký ít nhất 1 metric process_* chuẩn của prom-client
    expect(text).toMatch(/process_cpu_user_seconds_total/);
  });

  it('2 registry riêng biệt không đụng metric của nhau', async () => {
    const a = createMetricsRegistry({ appName: 'core-api' });
    const b = createMetricsRegistry({ appName: 'signaling-gateway' });

    expect(await a.metrics()).toContain('app="core-api"');
    expect(await b.metrics()).toContain('app="signaling-gateway"');
    expect(await a.metrics()).not.toContain('signaling-gateway');
  });
});
