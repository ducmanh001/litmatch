import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import { WebPushSubscription } from '../entities/web-push-subscription.entity';

import type { UpsertWebPushSubscriptionDto } from '../dto/web-push.dtos';

@Injectable()
export class WebPushSubscriptionService {
  constructor(
    @InjectRepository(WebPushSubscription)
    private readonly subscriptionRepo: Repository<WebPushSubscription>,
  ) {}

  async upsert(
    userId: string,
    input: UpsertWebPushSubscriptionDto,
  ): Promise<void> {
    await this.subscriptionRepo.upsert(
      {
        userId,
        endpoint: input.endpoint,
        p256dh: input.keys.p256dh,
        auth: input.keys.auth,
      },
      ['endpoint'],
    );
  }

  async remove(userId: string, endpoint: string): Promise<void> {
    await this.subscriptionRepo.delete({ userId, endpoint });
  }

  async listForUser(userId: string): Promise<WebPushSubscription[]> {
    return this.subscriptionRepo.find({ where: { userId } });
  }

  async removeById(id: string): Promise<void> {
    await this.subscriptionRepo.delete({ id });
  }
}
