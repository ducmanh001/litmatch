import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import helmet from 'helmet';
import { Logger } from 'nestjs-pino';

import { AppModule } from './app/app.module';

import type { SignalingEnv } from './config/env.validation';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule, { bufferLogs: true });
  app.useLogger(app.get(Logger));
  app.use(helmet());

  const config = app.get<ConfigService<SignalingEnv, true>>(ConfigService);
  app.enableShutdownHooks();
  await app.listen(config.getOrThrow('SIGNALING_PORT', { infer: true }));
}

void bootstrap();
