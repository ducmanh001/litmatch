import { metrics } from '@opentelemetry/api';

import type { Meter } from '@opentelemetry/api';

export interface CreateMetricsMeterInput {
  /** Tên app được gắn vào metric heartbeat; service.name nằm ở OTel resource. */
  appName: string;
}

/**
 * Lấy Meter từ provider đã được NodeSDK đăng ký trước khi Nest khởi tạo. Khi chưa cấu hình
 * exporter, OTel trả về no-op meter nên dev/test không tự gửi dữ liệu ra ngoài.
 */
export function createMetricsMeter(input: CreateMetricsMeterInput): Meter {
  const meter = metrics.getMeter('litmatch-observability');

  const up = meter.createObservableGauge('litmatch_up', {
    description: 'Process đang chạy và có thể export metrics',
    unit: '1',
  });
  up.addCallback((result) => result.observe(1, { app: input.appName }));

  const uptime = meter.createObservableGauge('process_uptime_seconds', {
    description: 'Thời gian process đã chạy, tính bằng giây',
    unit: 's',
  });
  uptime.addCallback((result) =>
    result.observe(process.uptime(), { app: input.appName }),
  );

  const residentMemory = meter.createObservableGauge(
    'process_resident_memory_bytes',
    {
      description: 'Resident memory của process, tính bằng bytes',
      unit: 'By',
    },
  );
  residentMemory.addCallback((result) =>
    result.observe(process.memoryUsage().rss, { app: input.appName }),
  );

  return meter;
}
