import { Registry, collectDefaultMetrics } from 'prom-client';

export interface CreateMetricsRegistryInput {
  /** Nhãn 'app' gắn vào MỌI metric — phân biệt core-api/signaling-gateway khi scrape chung 1
   * Prometheus (nhiều pod cùng app đã có nhãn `instance`/`pod` do Prometheus tự gắn lúc scrape). */
  appName: string;
}

/**
 * 1 Registry riêng cho mỗi process (docs/07 Giai đoạn 6) — không dùng registry global mặc định
 * của prom-client để tránh 2 app trong cùng test run (Jest) đụng metric name của nhau.
 */
export function createMetricsRegistry(
  input: CreateMetricsRegistryInput,
): Registry {
  const registry = new Registry();
  registry.setDefaultLabels({ app: input.appName });
  collectDefaultMetrics({ register: registry });
  return registry;
}
