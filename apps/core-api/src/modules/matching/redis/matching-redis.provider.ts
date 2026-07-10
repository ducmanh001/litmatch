import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';

export const MATCHING_REDIS = Symbol('MATCHING_REDIS');

export const matchingRedisProvider = {
  provide: MATCHING_REDIS,
  inject: [ConfigService],
  useFactory: (config: ConfigService): Redis => new Redis(config.getOrThrow<string>('REDIS_URL')),
};
