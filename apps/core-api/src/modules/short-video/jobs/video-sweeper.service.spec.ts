import { VideoSweeperService } from './video-sweeper.service';

import type { ConfigService } from '@nestjs/config';
import type { SchedulerRegistry } from '@nestjs/schedule';
import type { DataSource } from 'typeorm';
import type { CoreApiEnv } from '../../../config/env.validation';
import type { VideoStoragePort } from '../ports/video-storage.port';

function configStub(): ConfigService<CoreApiEnv, true> {
  return {
    getOrThrow: jest.fn(() => 3600),
  } as unknown as ConfigService<CoreApiEnv, true>;
}

describe('VideoSweeperService', () => {
  it('marks stale uploads failed, cleans storage and retries cleanup on the next tick', async () => {
    const dataSource = {
      query: jest
        .fn()
        .mockResolvedValueOnce([
          { id: 'video-1', storage_key: 'dev-video/orphan-1' },
        ])
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([
          { id: 'video-1', storage_key: 'dev-video/orphan-1' },
        ]),
    } as unknown as DataSource;
    const storagePort = {
      delete: jest
        .fn()
        .mockRejectedValueOnce(new Error('storage unavailable'))
        .mockResolvedValueOnce(undefined),
    } as unknown as jest.Mocked<VideoStoragePort>;
    const service = new VideoSweeperService(
      dataSource,
      storagePort,
      configStub(),
      {} as SchedulerRegistry,
    );

    await expect(service.runOnce()).resolves.toBe(1);
    await expect(service.runOnce()).resolves.toBe(0);

    expect(storagePort.delete).toHaveBeenNthCalledWith(1, 'dev-video/orphan-1');
    expect(storagePort.delete).toHaveBeenNthCalledWith(2, 'dev-video/orphan-1');
  });
});
