import { Inject, Module, OnApplicationShutdown } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { UserController } from './user.controller';
import { UserService } from './user.service';
import { User } from './entities/user.entity';
import { PrivacySetting } from './entities/privacy-setting.entity';
import { PrivacySettingsService } from './services/privacy-settings.service';
import { UserPresenceService } from './services/user-presence.service';
import { USER_REDIS, userRedisProvider } from './redis/user-redis.provider';
import type { RedisPresenceReader } from './redis/redis-presence-reader.adapter';

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
  constructor(
    @Inject(USER_REDIS) private readonly presence: RedisPresenceReader,
  ) {}

  async onApplicationShutdown(): Promise<void> {
    await this.presence.close();
  }
}
