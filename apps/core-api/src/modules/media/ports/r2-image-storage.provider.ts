import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import { S3ImageStorageProvider } from './s3-image-storage.provider';

import type { CoreApiEnv } from '../../../config/env.validation';

@Injectable()
export class R2ImageStorageProvider extends S3ImageStorageProvider {
  constructor(config: ConfigService<CoreApiEnv, true>) {
    const accountId = config.getOrThrow('MEDIA_R2_ACCOUNT_ID', {
      infer: true,
    });
    const bucket = config.getOrThrow('MEDIA_R2_BUCKET', { infer: true });
    const accessKeyId = config.getOrThrow('MEDIA_R2_ACCESS_KEY_ID', {
      infer: true,
    });
    const secretAccessKey = config.getOrThrow('MEDIA_R2_SECRET_ACCESS_KEY', {
      infer: true,
    });
    const publicBaseUrl = config.getOrThrow('MEDIA_PUBLIC_BASE_URL', {
      infer: true,
    });

    if (
      !accountId ||
      !bucket ||
      !accessKeyId ||
      !secretAccessKey ||
      !publicBaseUrl
    ) {
      throw new Error(
        'MEDIA_STORAGE_PROVIDER=r2 yêu cầu đầy đủ account, bucket, credential và MEDIA_PUBLIC_BASE_URL',
      );
    }

    super({
      region: 'auto',
      endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
      bucket,
      accessKeyId,
      secretAccessKey,
      forcePathStyle: false,
      publicBaseUrl,
      uploadUrlTtlSeconds: config.getOrThrow('MEDIA_UPLOAD_URL_TTL_SECONDS', {
        infer: true,
      }),
    });
  }
}
