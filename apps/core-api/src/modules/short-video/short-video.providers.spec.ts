import {
  createVideoStorageAdapter,
  createVideoTranscodeAdapter,
} from './ports/video-provider.factory';
import { DevVideoStorageAdapter } from './ports/dev-video-storage.adapter';
import { DevVideoTranscodeAdapter } from './ports/dev-video-transcode.adapter';
import { UnavailableVideoStorageAdapter } from './ports/unavailable-video-storage.adapter';
import { UnavailableVideoTranscodeAdapter } from './ports/unavailable-video-transcode.adapter';

import type { ConfigService } from '@nestjs/config';
import type { CoreApiEnv } from '../../config/env.validation';

function configFor(
  nodeEnv: CoreApiEnv['NODE_ENV'],
  uploadEnabled: boolean,
): ConfigService<CoreApiEnv, true> {
  return {
    get: jest.fn((key: string) => (key === 'NODE_ENV' ? nodeEnv : undefined)),
    getOrThrow: jest.fn(() => uploadEnabled),
  } as unknown as ConfigService<CoreApiEnv, true>;
}

describe('short-video provider selection', () => {
  it('development uses concrete dev adapters behind both ports', async () => {
    const config = configFor('development', true);
    const storage = createVideoStorageAdapter(config);
    const transcode = createVideoTranscodeAdapter(config);

    expect(storage).toBeInstanceOf(DevVideoStorageAdapter);
    expect(transcode).toBeInstanceOf(DevVideoTranscodeAdapter);
    await expect(storage.issueUploadUrl('dev-video/key')).resolves.toContain(
      'dev-video/key',
    );
    await expect(transcode.transcode('dev-video/key')).resolves.toMatchObject({
      durationSeconds: 15,
    });
  });

  it('production with upload disabled uses unavailable adapters, never dev adapters', async () => {
    const config = configFor('production', false);
    const storage = createVideoStorageAdapter(config);
    const transcode = createVideoTranscodeAdapter(config);

    expect(storage).toBeInstanceOf(UnavailableVideoStorageAdapter);
    expect(transcode).toBeInstanceOf(UnavailableVideoTranscodeAdapter);
    await expect(storage.issueUploadUrl('key')).rejects.toThrow(
      'provider thật chưa được cấu hình',
    );
    await expect(transcode.transcode('key')).rejects.toThrow(
      'provider thật chưa được cấu hình',
    );
  });

  it('production upload enabled fails before a dev adapter can be selected', () => {
    const config = configFor('production', true);

    expect(() => createVideoStorageAdapter(config)).toThrow(
      'VIDEO_UPLOAD_ENABLED=true',
    );
    expect(() => createVideoTranscodeAdapter(config)).toThrow(
      'VIDEO_UPLOAD_ENABLED=true',
    );
  });

  it('concrete dev adapters reject direct production construction as defense in depth', () => {
    const config = configFor('production', false);

    expect(() => new DevVideoStorageAdapter(config)).toThrow(
      'không bao giờ chạy trong production',
    );
    expect(() => new DevVideoTranscodeAdapter(config)).toThrow(
      'không bao giờ chạy trong production',
    );
  });
});
