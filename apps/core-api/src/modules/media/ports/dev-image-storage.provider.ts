import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomUUID } from 'node:crypto';

import { ImageStoragePort } from './image-storage.port';

import type { CoreApiEnv } from '../../../config/env.validation';

/** Dev/test adapter: không upload binary thật và không được phép boot ở production. */
@Injectable()
export class DevImageStorageProvider extends ImageStoragePort {
  private readonly logger = new Logger(DevImageStorageProvider.name);

  constructor(private readonly config: ConfigService<CoreApiEnv, true>) {
    super();
    if (this.config.get('NODE_ENV', { infer: true }) === 'production') {
      throw new Error(
        'DevImageStorageProvider không được dùng ở production — đặt MEDIA_STORAGE_PROVIDER=r2, s3 hoặc minio',
      );
    }
  }

  generateStorageKey(ownerUserId: string): string {
    return `dev-image/${ownerUserId}/${randomUUID()}`;
  }

  generateFinalStorageKey(ownerUserId: string, assetId: string): string {
    return `dev-image/${ownerUserId}/final/${assetId}`;
  }

  async issueUploadUrl(
    storageKey: string,
    contentType: string,
  ): Promise<{ uploadUrl: string; expiresAt: Date }> {
    void contentType;
    this.logger.warn(
      `[DEV-ONLY IMAGE STORAGE] issue upload url cho ${storageKey}; không có object thật`,
    );
    const expiresAt = new Date(Date.now() + 15 * 60 * 1000);
    return {
      uploadUrl: `https://dev-storage.invalid/upload/${storageKey}`,
      expiresAt,
    };
  }

  getPublicUrl(storageKey: string): string {
    return `https://dev-storage.invalid/images/${storageKey}`;
  }

  async head(storageKey: string): Promise<null> {
    void storageKey;
    return null;
  }

  async promote(sourceKey: string, destinationKey: string): Promise<void> {
    void sourceKey;
    void destinationKey;
  }

  async delete(storageKey: string): Promise<void> {
    void storageKey;
  }

  async readPrefix(storageKey: string): Promise<null> {
    void storageKey;
    return null;
  }
}
