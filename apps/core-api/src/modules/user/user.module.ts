import { Inject, Module, OnApplicationShutdown } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { closeCoreRedisClient } from '../../common/redis/core-redis-client';
import { UserController } from './user.controller';
import { UserService } from './user.service';
import { User } from './entities/user.entity';
import { PrivacySetting } from './entities/privacy-setting.entity';
import { PrivacySettingsService } from './services/privacy-settings.service';
import { UserPresenceService } from './services/user-presence.service';
import { USER_REDIS, userRedisProvider } from './redis/user-redis.provider';

import type Redis from 'ioredis';

@Module({
  imports: [TypeOrmModule.forFeature([User, PrivacySetting])],
  controllers: [UserController],
  providers: [
    UserService,
    PrivacySettingsService,
    UserPresenceService,
    userRedisProvider,
  ],
  exports: [UserService, PrivacySettingsService], // public API của module — module khác chỉ được import qua index.ts
})
export class UserModule implements OnApplicationShutdown {
  constructor(@Inject(USER_REDIS) private readonly redis: Redis) {}

  async onApplicationShutdown(): Promise<void> {
    await closeCoreRedisClient(this.redis);
  }
}
