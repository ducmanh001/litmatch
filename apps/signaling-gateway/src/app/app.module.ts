import { Module, RequestMethod } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import { buildPinoHttpOptions } from '@litmatch/logger';
import { createMetricsRegistry } from '@litmatch/observability';
import { LoggerModule } from 'nestjs-pino';

import { validateSignalingEnv } from '../config/env.validation';

import { HealthController } from './health.controller';
import { METRICS_REGISTRY } from './metrics.constants';
import { MetricsController } from './metrics.controller';
import { SignalingRedisAdapterService } from './redis-adapter.service';
import { SignalingGateway } from './signaling.gateway';

import type { SignalingEnv } from '../config/env.validation';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, validate: validateSignalingEnv }),
    LoggerModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService<SignalingEnv, true>) => ({
        pinoHttp: buildPinoHttpOptions({
          level: config.getOrThrow('LOG_LEVEL', { infer: true }),
          pretty: config.get('NODE_ENV', { infer: true }) === 'development',
        }),
        forRoutes: [{ path: '{*splat}', method: RequestMethod.ALL }],
      }),
    }),
    // Chỉ VERIFY access token của core-api (cùng JWT_SECRET) — gateway không bao giờ ký token
    JwtModule.registerAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService<SignalingEnv, true>) => ({
        secret: config.getOrThrow('JWT_SECRET', { infer: true }),
      }),
    }),
  ],
  controllers: [HealthController, MetricsController],
  providers: [
    SignalingGateway,
    SignalingRedisAdapterService,
    {
      provide: METRICS_REGISTRY,
      useFactory: () => createMetricsRegistry({ appName: 'signaling-gateway' }),
    },
  ],
})
export class AppModule {}
