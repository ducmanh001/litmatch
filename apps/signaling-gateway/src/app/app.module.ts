import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
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
      }),
    }),
  ],
  controllers: [HealthController],
  providers: [SignalingGateway],
})
export class AppModule {}
