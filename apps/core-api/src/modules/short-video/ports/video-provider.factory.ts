import type { ConfigService } from '@nestjs/config';

import { DevVideoStorageAdapter } from './dev-video-storage.adapter';
import { DevVideoTranscodeAdapter } from './dev-video-transcode.adapter';
import { UnavailableVideoStorageAdapter } from './unavailable-video-storage.adapter';
import { UnavailableVideoTranscodeAdapter } from './unavailable-video-transcode.adapter';
import type { VideoStoragePort } from './video-storage.port';
import type { VideoTranscodePort } from './video-transcode.port';
import { VIDEO_PRODUCTION_PROVIDER_REQUIRED_MESSAGE } from '../short-video.constants';

import type { CoreApiEnv } from '../../../config/env.validation';

type CoreConfig = ConfigService<CoreApiEnv, true>;

/** Production hiện chưa có vendor adapter thật nên upload phải fail-closed. */
export function assertVideoProviderConfiguration(config: CoreConfig): void {
  if (
    config.get('NODE_ENV', { infer: true }) === 'production' &&
    config.getOrThrow('VIDEO_UPLOAD_ENABLED', { infer: true })
  ) {
    throw new Error(VIDEO_PRODUCTION_PROVIDER_REQUIRED_MESSAGE);
  }
}

export function createVideoStorageAdapter(
  config: CoreConfig,
): VideoStoragePort {
  assertVideoProviderConfiguration(config);
  return config.get('NODE_ENV', { infer: true }) === 'production'
    ? new UnavailableVideoStorageAdapter()
    : new DevVideoStorageAdapter(config);
}

export function createVideoTranscodeAdapter(
  config: CoreConfig,
): VideoTranscodePort {
  assertVideoProviderConfiguration(config);
  return config.get('NODE_ENV', { infer: true }) === 'production'
    ? new UnavailableVideoTranscodeAdapter()
    : new DevVideoTranscodeAdapter(config);
}
