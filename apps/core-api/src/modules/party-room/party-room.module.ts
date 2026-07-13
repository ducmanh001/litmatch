import { Inject, Module, OnApplicationShutdown } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { PartyRoomController } from './party-room.controller';
import { PartyRoomService } from './party-room.service';
import { PartyRoom } from './entities/party-room.entity';
import { PartyRoomMember } from './entities/party-room-member.entity';
import { PartyRoomSweeperService } from './jobs/party-room-sweeper.service';
import {
  PartyLivekitRoomPort,
  SdkPartyLivekitRoomPort,
} from './ports/livekit-party-room';
import { PARTY_REDIS, partyRedisProvider } from './redis/party-redis.provider';
import { PartyLivekitWebhookController } from './webhooks/party-livekit-webhook.controller';
import { UserModule } from '../user';

import type Redis from 'ioredis';

@Module({
  imports: [
    TypeOrmModule.forFeature([PartyRoom, PartyRoomMember]),
    // đọc User.region của host để chốt LiveKit URL theo region lúc tạo phòng (GĐ7 — ADR 0005)
    UserModule,
  ],
  controllers: [PartyRoomController, PartyLivekitWebhookController],
  providers: [
    PartyRoomService,
    PartyRoomSweeperService,
    partyRedisProvider,
    { provide: PartyLivekitRoomPort, useClass: SdkPartyLivekitRoomPort },
  ],
  // Gift validate membership + lấy danh sách fanout qua PartyRoomService (DI — docs/03 § 3.7)
  exports: [PartyRoomService],
})
export class PartyRoomModule implements OnApplicationShutdown {
  constructor(@Inject(PARTY_REDIS) private readonly redis: Redis) {}

  async onApplicationShutdown(): Promise<void> {
    await this.redis.quit().catch(() => undefined);
  }
}
