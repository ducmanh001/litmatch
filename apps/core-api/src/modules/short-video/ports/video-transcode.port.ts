import { Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import type { CoreApiEnv } from '../../../config/env.validation';

export interface TranscodeResult {
  playbackUrl: string;
  thumbnailUrl: string;
  durationSeconds: number;
}

/**
 * Cổng transcode video — thật (Cloudflare Stream/Mux, ADR sau) là bất đồng bộ thật (webhook khi
 * xong); Dev port ở đây làm ĐỒNG BỘ (trả kết quả ngay) để V1 không cần thêm job/worker riêng —
 * khi thay bằng vendor thật, `VideoService` đổi từ "await xong luôn" sang "chờ webhook" mà
 * không đổi state machine (`processing` vẫn là bước trung gian, chỉ khác thời gian ở lại đó).
 */
export abstract class VideoTranscodePort {
  abstract transcode(storageKey: string): Promise<TranscodeResult>;
}

/** Dev/test: trả kết quả giả ngay lập tức — chặn cứng ở production. */
@Injectable()
export class DevVideoTranscodeProvider
  extends VideoTranscodePort
  implements OnApplicationBootstrap
{
  private readonly logger = new Logger(DevVideoTranscodeProvider.name);

  constructor(private readonly config: ConfigService<CoreApiEnv, true>) {
    super();
  }

  onApplicationBootstrap(): void {
    if (this.config.get('NODE_ENV', { infer: true }) === 'production') {
      throw new Error(
        'DevVideoTranscodeProvider không được dùng ở production — cấu hình VideoTranscodePort thật (Cloudflare Stream/Mux) trước khi deploy',
      );
    }
  }

  async transcode(storageKey: string): Promise<TranscodeResult> {
    this.logger.warn(`[DEV-ONLY VIDEO TRANSCODE] xử lý giả cho ${storageKey}`);
    return {
      playbackUrl: `https://dev-storage.invalid/playback/${storageKey}`,
      thumbnailUrl: `https://dev-storage.invalid/thumbnail/${storageKey}`,
      durationSeconds: 15,
    };
  }
}
