import { Logger } from '@nestjs/common';

import { VideoTranscodePort } from './video-transcode.port';

import type { ConfigService } from '@nestjs/config';
import type { CoreApiEnv } from '../../../config/env.validation';
import type { TranscodeResult } from './video-transcode.port';

/** Dev/test adapter: trả metadata giả đồng bộ và không chạy production. */
export class DevVideoTranscodeAdapter extends VideoTranscodePort {
  private readonly logger = new Logger(DevVideoTranscodeAdapter.name);

  constructor(private readonly config: ConfigService<CoreApiEnv, true>) {
    super();
    this.assertNonProduction();
  }

  async transcode(storageKey: string): Promise<TranscodeResult> {
    this.assertNonProduction();
    this.logger.warn(`[DEV-ONLY VIDEO TRANSCODE] xử lý giả cho ${storageKey}`);
    return {
      playbackUrl: `https://dev-storage.invalid/playback/${storageKey}`,
      thumbnailUrl: `https://dev-storage.invalid/thumbnail/${storageKey}`,
      durationSeconds: 15,
    };
  }

  private assertNonProduction(): void {
    if (this.config.get('NODE_ENV', { infer: true }) === 'production') {
      throw new Error(
        'DevVideoTranscodeAdapter không bao giờ chạy trong production',
      );
    }
  }
}
