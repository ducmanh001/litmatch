import { Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import type { CoreApiEnv } from '../../../config/env.validation';

/**
 * Cổng lưu trữ video — thật (Cloudflare Stream/Mux, ADR sau khi có bảng giá cụ thể) cắm vào ở
 * giai đoạn sau. Body video KHÔNG BAO GIỜ chạm NestJS — client upload thẳng lên storage qua
 * `uploadUrl` presigned; server chỉ biết `storageKey` để tra cứu sau.
 *
 * Tách sinh `storageKey` (pure, không I/O) khỏi `issueUploadUrl` (có I/O, có thể gọi LẠI cho
 * CÙNG 1 storageKey) — đây là điều kiện để idempotent-replay của `createUploadIntent` phát lại
 * ĐÚNG URL cho video đã tạo thay vì phải bịa 1 key mới không ai dùng.
 */
export abstract class VideoStoragePort {
  abstract generateStorageKey(authorUserId: string): string;
  abstract issueUploadUrl(storageKey: string): Promise<string>;
  abstract getPlaybackUrl(storageKey: string): Promise<string>;
  abstract getThumbnailUrl(storageKey: string): Promise<string>;
}

/**
 * Dev/test: sinh `uploadUrl` giả, không thật sự lưu file nào — chặn cứng ở production, giống
 * `DevSmsProvider`/`DevIapVerifier`.
 */
@Injectable()
export class DevVideoStorageProvider
  extends VideoStoragePort
  implements OnApplicationBootstrap
{
  private readonly logger = new Logger(DevVideoStorageProvider.name);

  constructor(private readonly config: ConfigService<CoreApiEnv, true>) {
    super();
  }

  onApplicationBootstrap(): void {
    if (
      this.config.get('NODE_ENV', { infer: true }) === 'production' &&
      this.config.getOrThrow('VIDEO_UPLOAD_ENABLED', { infer: true })
    ) {
      throw new Error(
        'DevVideoStorageProvider không được dùng ở production — cấu hình VideoStoragePort thật (Cloudflare Stream/Mux) trước khi deploy',
      );
    }
  }

  generateStorageKey(authorUserId: string): string {
    return `dev-video/${authorUserId}/${Date.now()}-${Math.random().toString(36).slice(2)}`;
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

  private assertNonProduction(): void {
    if (this.config.get('NODE_ENV', { infer: true }) === 'production') {
      throw new Error(
        'DevVideoStorageProvider không bao giờ chạy trong production',
      );
    }
  }
}
