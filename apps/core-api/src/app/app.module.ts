import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { APP_FILTER, APP_GUARD, APP_INTERCEPTOR } from '@nestjs/core';
import { ScheduleModule } from '@nestjs/schedule';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { TypeOrmModule } from '@nestjs/typeorm';
import { buildPinoHttpOptions } from '@litmatch/logger';
import { LoggerModule } from 'nestjs-pino';

import { validateCoreApiEnv } from '../config/env.validation';

import type { CoreApiEnv } from '../config/env.validation';
import { SnakeNamingStrategy } from '../database/snake-naming.strategy';
import { GlobalExceptionFilter } from '../common/filters/global-exception.filter';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { ResponseEnvelopeInterceptor } from '../common/interceptors/response-envelope.interceptor';
import { AuthModule } from '../modules/auth';
import { EconomyModule } from '../modules/economy';
import { MatchingModule } from '../modules/matching';
import { UserModule } from '../modules/user';

import { HealthController } from './health.controller';
import { ReadinessService } from './readiness.service';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, validate: validateCoreApiEnv }),
    LoggerModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService<CoreApiEnv, true>) => ({
        pinoHttp: buildPinoHttpOptions({
          level: config.getOrThrow('LOG_LEVEL', { infer: true }),
          pretty: config.get('NODE_ENV', { infer: true }) === 'development',
        }),
      }),
    }),
    TypeOrmModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService<CoreApiEnv, true>) => ({
        type: 'postgres' as const,
        url: config.getOrThrow('DATABASE_URL', { infer: true }),
        autoLoadEntities: true,
        synchronize: false, // schema chỉ đổi qua migration (docs/04)
        namingStrategy: new SnakeNamingStrategy(),
      }),
    }),
    ThrottlerModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService<CoreApiEnv, true>) => ({
        throttlers: [
          {
            ttl:
              config.getOrThrow('THROTTLE_TTL_SECONDS', { infer: true }) * 1000,
            limit: config.getOrThrow('THROTTLE_LIMIT', { infer: true }),
          },
        ],
      }),
    }),
    ScheduleModule.forRoot(),
    UserModule,
    AuthModule,
    EconomyModule,
    MatchingModule,
  ],
  controllers: [HealthController],
  providers: [
    ReadinessService,
    { provide: APP_GUARD, useClass: ThrottlerGuard },
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_INTERCEPTOR, useClass: ResponseEnvelopeInterceptor },
    { provide: APP_FILTER, useClass: GlobalExceptionFilter },
  ],
})
export class AppModule {}
