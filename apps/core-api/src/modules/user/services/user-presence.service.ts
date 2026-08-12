import { Inject, Injectable } from '@nestjs/common';

import type { UserPresenceReaderPort } from '../ports/user-presence-reader.port';
import { USER_REDIS } from '../redis/user-redis.provider';

@Injectable()
export class UserPresenceService {
  constructor(
    @Inject(USER_REDIS) private readonly presence: UserPresenceReaderPort,
  ) {}

  /** Presence fail-closed: Redis lỗi không được biến thành thông tin online bị lộ. */
  async isOnline(userId: string): Promise<boolean> {
    return this.presence.isOnline(userId);
  }
}
