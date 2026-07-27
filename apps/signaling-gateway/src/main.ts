import './tracing'; // PHẢI đứng đầu file — docs/07 GĐ6, xem libs/observability/src/lib/tracing.ts

import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import {
  createHttpMetricsMiddleware,
  initializeSentry,
} from '@litmatch/observability';
import helmet from 'helmet';
import { Logger } from 'nestjs-pino';

import { AppModule } from './app/app.module';
import { CorsIoAdapter } from './app/cors-io.adapter';
import { METRICS_REGISTRY } from './app/metrics.constants';
import { SignalingRedisAdapterService } from './app/redis-adapter.service';

import type { SignalingEnv } from './config/env.validation';
import type { Registry } from 'prom-client';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule, { bufferLogs: true });
  app.useLogger(app.get(Logger));
  app.use(helmet());
  app.use(createHttpMetricsMiddleware(app.get<Registry>(METRICS_REGISTRY))); // docs/07 GĐ6

  const config = app.get<ConfigService<SignalingEnv, true>>(ConfigService);
  initializeSentry({
    dsn: config.getOrThrow('SENTRY_DSN', { infer: true }),
    environment: config.getOrThrow('NODE_ENV', { infer: true }),
    release: config.getOrThrow('SENTRY_RELEASE', { infer: true }),
    serviceName: 'signaling-gateway',
  });
  const corsOrigins = config
    .getOrThrow('CORS_ORIGINS', { infer: true })
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);
  app.enableCors({ origin: corsOrigins.length > 0 ? corsOrigins : false });

  // Cluster adapter PHẢI sẵn sàng trước app.listen() — gateway afterInit() chạy lúc listen
  // và cần adapter đã gắn vào Server để nhiều instance chia sẻ room/broadcast (docs/07 GĐ6).
  const redisAdapter = app.get(SignalingRedisAdapterService);
  const clusterAdapter = await redisAdapter.connect(
    config.getOrThrow('REDIS_URL', { infer: true }),
  );
  app.useWebSocketAdapter(new CorsIoAdapter(app, corsOrigins, clusterAdapter));

  app.enableShutdownHooks();
  await app.listen(config.getOrThrow('SIGNALING_PORT', { infer: true }));
}

void bootstrap();
