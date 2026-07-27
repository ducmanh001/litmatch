import './tracing'; // PHẢI đứng đầu file — docs/07 GĐ6, xem libs/observability/src/lib/tracing.ts

import { ClassSerializerInterceptor, ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory, Reflector } from '@nestjs/core';
import { SwaggerModule } from '@nestjs/swagger';
import {
  createHttpMetricsMiddleware,
  initializeSentry,
} from '@litmatch/observability';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';
import { Logger } from 'nestjs-pino';

import { AppModule } from './app/app.module';
import {
  API_GLOBAL_PREFIX,
  API_PREFIX_EXCLUDES,
  buildOpenApiDocument,
} from './app/openapi';
import { parseCorsOrigins } from './common/cors/cors-origins';
import { METRICS_REGISTRY } from './common/metrics/metrics.constants';

import type { CoreApiEnv } from './config/env.validation';
import type { NestExpressApplication } from '@nestjs/platform-express';
import type { Registry } from 'prom-client';

async function bootstrap(): Promise<void> {
  // rawBody: webhook LiveKit verify chữ ký trên NGUYÊN VĂN body (calling/webhooks — spec § 3).
  // bodyParser:false — LiveKit gửi webhook với Content-Type: application/webhook+json (không
  // chuẩn), cần 1 parser JSON riêng khớp đúng type đó. NHƯNG Nest tự đăng ký parser mặc định
  // dựa vào TÊN HÀM middleware ('jsonParser'), không phân biệt theo content-type filter — nếu
  // để Nest tự đăng ký (bodyParser mặc định true) rồi tự thêm 1 express.json() riêng, Nest thấy
  // "đã có jsonParser rồi" và ÂM THẦM BỎ QUA parser 'application/json' thật, vỡ toàn bộ API
  // (phát hiện qua UX audit 2026-07-14 — mọi request JSON bình thường trả lỗi validate sai vì
  // body không được parse). Tắt tự động, tự đăng ký cả 2 tường minh bên dưới theo đúng thứ tự.
  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    bufferLogs: true,
    rawBody: true,
    bodyParser: false,
  });
  app.useLogger(app.get(Logger));

  app.useBodyParser('json'); // mặc định — 'application/json', đại đa số request thật
  app.useBodyParser('urlencoded', { extended: true });
  // LiveKit — content-type riêng, rawBody vẫn bật vì app tạo với `rawBody: true` ở trên
  // (INestApplication#useBodyParser tự áp dụng cờ đó cho mọi parser đăng ký thủ công).
  app.useBodyParser('json', { type: 'application/webhook+json' });

  const config = app.get<ConfigService<CoreApiEnv, true>>(ConfigService);
  initializeSentry({
    dsn: config.getOrThrow('SENTRY_DSN', { infer: true }),
    environment: config.getOrThrow('NODE_ENV', { infer: true }),
    release: config.getOrThrow('SENTRY_RELEASE', { infer: true }),
    serviceName: 'core-api',
  });

  app.setGlobalPrefix(API_GLOBAL_PREFIX, {
    exclude: API_PREFIX_EXCLUDES,
  }); // version trong URI ngay từ đầu (docs/05 § 5.4)
  app.use(helmet());
  app.use(cookieParser()); // đọc refresh_token/csrf_token httpOnly (ADR 0007) — trước mọi guard
  app.use(createHttpMetricsMiddleware(app.get<Registry>(METRICS_REGISTRY))); // docs/07 Giai đoạn 6 — http_request_duration_seconds

  // Đã validate format lúc boot ở env.validation.ts (Joi custom) — parse lại đây chỉ để lấy
  // mảng, không throw lần 2 trong điều kiện bình thường.
  const corsOrigins = parseCorsOrigins(
    config.getOrThrow('CORS_ORIGINS', { infer: true }),
  );
  app.enableCors({
    origin: corsOrigins.length > 0 ? corsOrigins : false, // cấm '*' (docs/05 § 5.8)
    credentials: true, // browser gửi kèm cookie httpOnly cross-origin (web/admin khác port với core-api — ADR 0007)
  });

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
