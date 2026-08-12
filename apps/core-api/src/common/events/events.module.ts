import { Global, Module } from '@nestjs/common';

import { EventBusPort } from './event-bus.port';
import { KafkaEventBusAdapter } from './kafka-event-bus.adapter';

@Global()
@Module({
  providers: [
    KafkaEventBusAdapter,
    { provide: EventBusPort, useExisting: KafkaEventBusAdapter },
  ],
  exports: [EventBusPort],
})
export class EventsModule {}
