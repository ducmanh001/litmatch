import { Inject, Injectable } from '@nestjs/common';
import { realtimePresenceKey } from '@litmatch/common-dtos';
import type Redis from 'ioredis';

import { USER_REDIS } from '../redis/user-redis.provider';

@Injectable()
export class UserPresenceService {
  constructor(@Inject(USER_REDIS) private readonly redis: Redis) {}

  /** Presence fail-closed: Redis lỗi không được biến thành thông tin online bị lộ. */
  async isOnline(userId: string): Promise<boolean> {
    try {
      const key = realtimePresenceKey(userId);
      await this.redis.zremrangebyscore(key, '-inf', Date.now());
      return (await this.redis.zcard(key)) > 0;
    } catch {
      return false;
    }
  }
}
