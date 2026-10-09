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

function makeService(
  query: jest.Mock,
  remove: jest.Mock,
): { service: VideoSweeperService; query: jest.Mock; remove: jest.Mock } {
  const service = new VideoSweeperService(
    { query } as unknown as DataSource,
    { delete: remove } as unknown as VideoStoragePort,
    configStub(),
    {} as SchedulerRegistry,
  );
  return { service, query, remove };
}

const sqlOf = (call: unknown[]): string => String(call[0]).replace(/\s+/g, ' ');

describe('VideoSweeperService', () => {
  it('marks stale uploads failed, cleans storage, defers a failed cleanup and marks the retry done', async () => {
    const { service, query, remove } = makeService(
      jest
        .fn()
        // tick 1: một video quá hạn → failed; không có hàng failed cũ
        .mockResolvedValueOnce([
          { id: 'video-1', storage_key: 'dev-video/orphan-1' },
        ])
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce(undefined) // đẩy updated_at về cuối hàng đợi sau khi xoá lỗi
        // tick 2: không còn video quá hạn; hàng failed chưa dọn được chọn lại
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([
          { id: 'video-1', storage_key: 'dev-video/orphan-1' },
        ])
        .mockResolvedValueOnce(undefined), // đánh dấu đã dọn
      jest
        .fn()
        .mockRejectedValueOnce(new Error('storage unavailable'))
        .mockResolvedValueOnce(undefined),
    );

    await expect(service.runOnce()).resolves.toBe(1);
    await expect(service.runOnce()).resolves.toBe(0);

    expect(remove).toHaveBeenNthCalledWith(1, 'dev-video/orphan-1');
    expect(remove).toHaveBeenNthCalledWith(2, 'dev-video/orphan-1');
    expect(sqlOf(query.mock.calls[2] as unknown[])).toContain(
      'SET updated_at = now()',
    );
    expect(sqlOf(query.mock.calls[5] as unknown[])).toContain(
      'SET storage_cleaned_at = now()',
    );
  });

  it('chỉ chọn video failed CHƯA dọn, nên hàng đã dọn không chiếm slot của hàng mới hơn', async () => {
    const { service, query } = makeService(
      jest.fn().mockResolvedValue([]),
      jest.fn(),
    );

    await service.runOnce();

    const selectFailed = sqlOf(query.mock.calls[1] as unknown[]);
    expect(selectFailed).toContain('storage_cleaned_at IS NULL');
    expect(selectFailed).toContain('ORDER BY updated_at ASC, id ASC');
  });

  it('xoá lỗi thì không đánh dấu đã dọn; lỗi đẩy hàng đợi cũng không làm hỏng tick', async () => {
    const { service, query, remove } = makeService(
      jest
        .fn()
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([
          { id: 'video-9', storage_key: 'dev-video/stuck' },
        ])
        .mockRejectedValueOnce(new Error('db blip')),
      jest.fn().mockRejectedValue(new Error('403 forbidden')),
    );

    await expect(service.runOnce()).resolves.toBe(0);

    expect(remove).toHaveBeenCalledTimes(1);
    const sqls = query.mock.calls.map((call) => sqlOf(call as unknown[]));
    expect(sqls.some((sql) => sql.includes('SET storage_cleaned_at'))).toBe(
      false,
    );
  });

  it('mỗi video chỉ bị xoá một lần dù vừa quá hạn vừa nằm trong hàng failed', async () => {
    const dup = { id: 'video-2', storage_key: 'dev-video/dup' };
    const { service, remove } = makeService(
      jest
        .fn()
        .mockResolvedValueOnce([dup])
        .mockResolvedValueOnce([dup])
        .mockResolvedValue(undefined),
      jest.fn().mockResolvedValue(undefined),
    );

    await service.runOnce();

    expect(remove).toHaveBeenCalledTimes(1);
  });
});
