import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { buildPinoHttpOptions } from '@litmatch/logger';
import { LoggerModule } from 'nestjs-pino';

import { validateSignalingEnv } from '../config/env.validation';

import { HealthController } from './health.controller';
import { SignalingGateway } from './signaling.gateway';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, validate: validateSignalingEnv }),
    LoggerModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        pinoHttp: buildPinoHttpOptions({
          level: config.getOrThrow<string>('LOG_LEVEL'),
          pretty: config.get<string>('NODE_ENV') === 'development',
        }),
      }),
    }),
  ],
  controllers: [HealthController],
  providers: [SignalingGateway],
})
export class AppModule {}
