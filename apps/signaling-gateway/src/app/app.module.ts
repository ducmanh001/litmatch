import { Module, RequestMethod } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import { buildPinoHttpOptions } from '@litmatch/logger';
import { LoggerModule } from 'nestjs-pino';

import { validateSignalingEnv } from '../config/env.validation';

import { HealthController } from './health.controller';
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
  controllers: [HealthController],
  providers: [SignalingGateway],
})
export class AppModule {}
