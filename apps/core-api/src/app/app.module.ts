import { Module, RequestMethod } from '@nestjs/common';
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
import { RolesGuard } from '../common/guards/roles.guard';
import { ResponseEnvelopeInterceptor } from '../common/interceptors/response-envelope.interceptor';
import { MetricsModule } from '../common/metrics/metrics.module';
import { AdminModule } from '../modules/admin';
import { AuthModule } from '../modules/auth';
import { AvatarModule } from '../modules/avatar';
import { CallingModule } from '../modules/calling';
import { EconomyModule } from '../modules/economy';
import { FeedModule } from '../modules/feed';
import { FriendModule } from '../modules/friend';
import { GiftModule } from '../modules/gift';
import { MatchingModule } from '../modules/matching';
import { MiniGameModule } from '../modules/mini-game';
import { MovieMatchModule } from '../modules/movie-match';
import { NotificationModule } from '../modules/notification';
import { PalmMatchModule } from '../modules/palm-match';
import { PartyRoomModule } from '../modules/party-room';
import { SafetyModule } from '../modules/safety';
import { SoulMatchModule } from '../modules/soul-match';
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
        // Express 5/path-to-regexp yêu cầu wildcard có tên; nestjs-pino default `*` là legacy.
        forRoutes: [{ path: '{*splat}', method: RequestMethod.ALL }],
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
    MetricsModule,
    UserModule,
    AuthModule,
    EconomyModule,
    MatchingModule,
    FriendModule,
    SoulMatchModule,
    CallingModule,
    PartyRoomModule,
    GiftModule,
    SafetyModule,
    FeedModule,
    NotificationModule,
    AvatarModule,
    MovieMatchModule,
    PalmMatchModule,
    MiniGameModule,
    AdminModule,
  ],
  controllers: [HealthController],
  providers: [
    ReadinessService,
    { provide: APP_GUARD, useClass: ThrottlerGuard },
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: RolesGuard },
    { provide: APP_INTERCEPTOR, useClass: ResponseEnvelopeInterceptor },
    { provide: APP_FILTER, useClass: GlobalExceptionFilter },
  ],
})
export class AppModule {}
