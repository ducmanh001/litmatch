import 'reflect-metadata';

import { RealtimeEvents, realtimeUserChannel } from '@litmatch/common-dtos';

import type { Logger } from '@nestjs/common';
import type { RealtimeEnvelope } from '@litmatch/common-dtos';

import { publishRealtimeEvent } from './publish-realtime';
import type { RealtimePublisherPort } from './realtime-publisher.port';

const envelope: RealtimeEnvelope = {
  event: RealtimeEvents.MatchConfirmed,
  data: { ticketId: 'ticket-1', sessionId: 'session-1' },
};

describe('publishRealtimeEvent', () => {
  const publisher: jest.Mocked<RealtimePublisherPort> = {
    publish: jest.fn(),
  };
  const logger = { warn: jest.fn() } as unknown as Logger;

  beforeEach(() => jest.clearAllMocks());

  it('publishes through the capability port', async () => {
    publisher.publish.mockResolvedValue(undefined);

    await publishRealtimeEvent(publisher, logger, 'user-1', envelope);

    expect(publisher.publish).toHaveBeenCalledWith(
      realtimeUserChannel('user-1'),
      JSON.stringify(envelope),
    );
  });

  it('swallows publisher failures and logs the REST-polling fallback', async () => {
    publisher.publish.mockRejectedValue(new Error('Redis unavailable'));

    await expect(
      publishRealtimeEvent(publisher, logger, 'user-1', envelope),
    ).resolves.toBeUndefined();

    expect(logger.warn).toHaveBeenCalledWith(
      expect.stringContaining('client còn polling fallback'),
    );
  });
});
