import { Logger } from '@nestjs/common';
import { randomUUID } from 'node:crypto';

import { VideoStoragePort } from './video-storage.port';

import type { ConfigService } from '@nestjs/config';
import type { CoreApiEnv } from '../../../config/env.validation';

/**
 * Dev/test adapter: không upload binary thật. Adapter này chỉ được tạo ngoài production;
 * provider factory là chốt chọn implementation, còn guard ở đây bảo vệ cả lúc gọi trực tiếp.
 */
export class DevVideoStorageAdapter extends VideoStoragePort {
  private readonly logger = new Logger(DevVideoStorageAdapter.name);

  constructor(private readonly config: ConfigService<CoreApiEnv, true>) {
    super();
    this.assertNonProduction();
  }

  generateStorageKey(authorUserId: string): string {
    this.assertNonProduction();
    return `dev-video/${authorUserId}/${randomUUID()}`;
  }

  async issueUploadUrl(storageKey: string): Promise<string> {
    this.assertNonProduction();
    this.logger.warn(
      `[DEV-ONLY VIDEO STORAGE] issue upload url cho ${storageKey}`,
    );
    return `https://dev-storage.invalid/upload/${storageKey}`;
  }

  async getPlaybackUrl(storageKey: string): Promise<string> {
    this.assertNonProduction();
    return `https://dev-storage.invalid/playback/${storageKey}`;
  }

  async getThumbnailUrl(storageKey: string): Promise<string> {
    this.assertNonProduction();
    return `https://dev-storage.invalid/thumbnail/${storageKey}`;
  }

  async delete(storageKey: string): Promise<void> {
    this.assertNonProduction();
    this.logger.debug(`[DEV-ONLY VIDEO STORAGE] cleanup ${storageKey}`);
  }

  private assertNonProduction(): void {
    if (this.config.get('NODE_ENV', { infer: true }) === 'production') {
      throw new Error(
        'DevVideoStorageAdapter không bao giờ chạy trong production',
      );
    }
  }
}
