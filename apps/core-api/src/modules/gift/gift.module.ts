import { Inject, Module, OnApplicationShutdown } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { GiftController } from './gift.controller';
import { GiftService } from './gift.service';
import { Gift } from './entities/gift.entity';
import { GiftEvent } from './entities/gift-event.entity';
import { GIFT_REDIS, giftRedisProvider } from './redis/gift-redis.provider';
import { EconomyModule } from '../economy';
import { NotificationModule } from '../notification';
import { PartyRoomModule } from '../party-room';
import { UserModule } from '../user';

import type Redis from 'ioredis';

@Module({
  imports: [
    TypeOrmModule.forFeature([Gift, GiftEvent]),
    EconomyModule, // giao dịch 2 chân DIA+PTS qua sendGift (DI trong process — docs/03 § 3.7)
    PartyRoomModule, // validate membership phòng + danh sách fanout realtime
    UserModule, // check người nhận là guest (không nhận PTS — docs/06 § Gift)
    NotificationModule, // in-app notification gift_received (docs/services/notification-service.md § 3)
  ],
  controllers: [GiftController],
  providers: [GiftService, giftRedisProvider],
  exports: [], // chưa module nào cần gọi Gift — export tối thiểu (docs/05 § 5.3)
})
export class GiftModule implements OnApplicationShutdown {
  constructor(@Inject(GIFT_REDIS) private readonly redis: Redis) {}

  async onApplicationShutdown(): Promise<void> {
    await this.redis.quit().catch(() => undefined);
  }
}
