import { Inject, Module, OnApplicationShutdown } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { DiscoveryController } from './discovery.controller';
import { DiscoveryService } from './discovery.service';
import { NearbyService } from './nearby.service';
import { DiscoverySetting } from './entities/discovery-setting.entity';
import { UserLocation } from './entities/user-location.entity';
import {
  DISCOVERY_REDIS,
  discoveryRedisProvider,
} from './redis/discovery-redis.provider';
import { SafetyModule } from '../safety';
import { UserModule } from '../user';

import type Redis from 'ioredis';

@Module({
  imports: [
    TypeOrmModule.forFeature([DiscoverySetting, UserLocation]),
    UserModule,
    SafetyModule,
  ],
  controllers: [DiscoveryController],
  providers: [DiscoveryService, NearbyService, discoveryRedisProvider],
  // public API của module — module khác chỉ được import qua index.ts
  exports: [DiscoveryService, NearbyService],
})
export class DiscoveryModule implements OnApplicationShutdown {
  constructor(@Inject(DISCOVERY_REDIS) private readonly redis: Redis) {}

  async onApplicationShutdown(): Promise<void> {
    await this.redis.quit().catch(() => undefined);
  }
}
