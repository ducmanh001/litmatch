import { Global, Module } from '@nestjs/common';
import { createMetricsMeter } from '@litmatch/observability';

import { METRICS_METER } from './metrics.constants';

/**
 * Global — mọi module domain (matching/calling/economy...) inject METRICS_METER trực tiếp
 * để tự đăng ký metric riêng của mình, không cần import lại module này (docs/07 Giai đoạn 6).
 */
@Global()
@Module({
  providers: [
    {
      provide: METRICS_METER,
      useFactory: () => createMetricsMeter({ appName: 'core-api' }),
    },
  ],
  exports: [METRICS_METER],
})
export class MetricsModule {}
