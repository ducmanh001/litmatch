import './tracing'; // PHẢI đứng đầu file — docs/07 GĐ6, xem libs/observability/src/lib/tracing.ts

import { ClassSerializerInterceptor, ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory, Reflector } from '@nestjs/core';
import { SwaggerModule } from '@nestjs/swagger';
import { createHttpMetricsMiddleware } from '@litmatch/observability';
import helmet from 'helmet';
import { Logger } from 'nestjs-pino';

import { AppModule } from './app/app.module';
import {
  API_GLOBAL_PREFIX,
  API_PREFIX_EXCLUDES,
  buildOpenApiDocument,
} from './app/openapi';
import { METRICS_REGISTRY } from './common/metrics/metrics.constants';

import type { CoreApiEnv } from './config/env.validation';
import type { Registry } from 'prom-client';

async function bootstrap(): Promise<void> {
  // rawBody: webhook LiveKit verify chữ ký trên NGUYÊN VĂN body (calling/webhooks — spec § 3)
  const app = await NestFactory.create(AppModule, {
    bufferLogs: true,
    rawBody: true,
  });
  app.useLogger(app.get(Logger));

  const config = app.get<ConfigService<CoreApiEnv, true>>(ConfigService);

  app.setGlobalPrefix(API_GLOBAL_PREFIX, {
    exclude: API_PREFIX_EXCLUDES,
  }); // version trong URI ngay từ đầu (docs/05 § 5.4)
  app.use(helmet());
  app.use(createHttpMetricsMiddleware(app.get<Registry>(METRICS_REGISTRY))); // docs/07 Giai đoạn 6 — http_request_duration_seconds

  const corsOrigins = config
    .getOrThrow('CORS_ORIGINS', { infer: true })
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  app.enableCors({ origin: corsOrigins.length > 0 ? corsOrigins : false }); // cấm '*' (docs/05 § 5.8)

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );
  app.useGlobalInterceptors(new ClassSerializerInterceptor(app.get(Reflector)));

  if (
    config.getOrThrow('SWAGGER_ENABLED', { infer: true }) &&
    config.get('NODE_ENV', { infer: true }) !== 'production'
  ) {
    SwaggerModule.setup('docs', app, buildOpenApiDocument(app));
  }

  app.enableShutdownHooks();
  await app.listen(config.getOrThrow('PORT', { infer: true }));
}

void bootstrap();
