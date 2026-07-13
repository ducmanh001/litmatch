import { Global, Module } from '@nestjs/common';
import { createMetricsRegistry } from '@litmatch/observability';

import { METRICS_REGISTRY } from './metrics.constants';
import { MetricsController } from './metrics.controller';

/**
 * Global — mọi module domain (matching/calling/economy...) inject METRICS_REGISTRY trực tiếp
 * để tự đăng ký metric riêng của mình, không cần import lại module này (docs/07 Giai đoạn 6).
 */
@Global()
@Module({
  controllers: [MetricsController],
  providers: [
    {
      provide: METRICS_REGISTRY,
      useFactory: () => createMetricsRegistry({ appName: 'core-api' }),
    },
  ],
  exports: [METRICS_REGISTRY],
})
export class MetricsModule {}
