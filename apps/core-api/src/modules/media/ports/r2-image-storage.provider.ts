import {
  CopyObjectCommand,
  DeleteObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomUUID } from 'node:crypto';

import { ImageStoragePort } from './image-storage.port';

import type { CoreApiEnv } from '../../../config/env.validation';
import type { ImageObjectMetadata } from './image-storage.port';

@Injectable()
export class R2ImageStorageProvider extends ImageStoragePort {
  private readonly client: S3Client;
  private readonly bucket: string;
  private readonly publicBaseUrl: string;
  private readonly uploadUrlTtlSeconds: number;

  constructor(config: ConfigService<CoreApiEnv, true>) {
    super();
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
    this.bucket = bucket;
    this.publicBaseUrl = config
      .getOrThrow('MEDIA_PUBLIC_BASE_URL', { infer: true })
      .replace(/\/+$/u, '');
    this.uploadUrlTtlSeconds = config.getOrThrow(
      'MEDIA_UPLOAD_URL_TTL_SECONDS',
      {
        infer: true,
      },
    );
    this.client = new S3Client({
      region: 'auto',
      endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
      credentials: {
        accessKeyId,
        secretAccessKey,
      },
    });
  }

  generateStorageKey(ownerUserId: string): string {
    return `images/${ownerUserId}/${randomUUID()}`;
  }

  generateFinalStorageKey(ownerUserId: string, assetId: string): string {
    return `images/${ownerUserId}/${assetId}`;
  }

  async issueUploadUrl(
    storageKey: string,
    contentType: string,
  ): Promise<{ uploadUrl: string; expiresAt: Date }> {
    const expiresAt = new Date(Date.now() + this.uploadUrlTtlSeconds * 1000);
    const uploadUrl = await getSignedUrl(
      this.client,
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: storageKey,
        ContentType: contentType,
      }),
      { expiresIn: this.uploadUrlTtlSeconds },
    );
    return { uploadUrl, expiresAt };
  }

  getPublicUrl(storageKey: string): string {
    return `${this.publicBaseUrl}/${storageKey
      .split('/')
      .map((part) => encodeURIComponent(part))
      .join('/')}`;
  }

  async promote(sourceKey: string, destinationKey: string): Promise<void> {
    await this.client.send(
      new CopyObjectCommand({
        Bucket: this.bucket,
        CopySource: `${this.bucket}/${encodeURIComponent(sourceKey)}`,
        Key: destinationKey,
        MetadataDirective: 'COPY',
      }),
    );
    await this.delete(sourceKey);
  }

  async delete(storageKey: string): Promise<void> {
    await this.client.send(
      new DeleteObjectCommand({ Bucket: this.bucket, Key: storageKey }),
    );
  }

  async head(storageKey: string): Promise<ImageObjectMetadata | null> {
    try {
      const result = await this.client.send(
        new HeadObjectCommand({ Bucket: this.bucket, Key: storageKey }),
      );
      return {
        sizeBytes: result.ContentLength ?? 0,
        contentType: result.ContentType ?? '',
      };
    } catch (error) {
      const name = error instanceof Error ? error.name : '';
      if (name === 'NotFound' || name === 'NoSuchKey') return null;
      throw error;
    }
  }

  async readPrefix(storageKey: string): Promise<Uint8Array | null> {
    try {
      const result = await this.client.send(
        new GetObjectCommand({
          Bucket: this.bucket,
          Key: storageKey,
          Range: 'bytes=0-4095',
        }),
      );
      return result.Body ? await result.Body.transformToByteArray() : null;
    } catch (error) {
      const name = error instanceof Error ? error.name : '';
      if (name === 'NotFound' || name === 'NoSuchKey') return null;
      throw error;
    }
  }
}
