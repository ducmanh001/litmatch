import {
  CopyObjectCommand,
  DeleteObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { randomUUID } from 'node:crypto';

import { ImageStoragePort } from './image-storage.port';

import type { CoreApiEnv } from '../../../config/env.validation';
import type { ConfigService } from '@nestjs/config';
import type { ImageObjectMetadata } from './image-storage.port';

export interface S3ImageStorageProviderOptions {
  region: string;
  endpoint?: string;
  bucket: string;
  accessKeyId: string;
  secretAccessKey: string;
  forcePathStyle: boolean;
  publicBaseUrl: string;
  uploadUrlTtlSeconds: number;
}

export function s3ImageStorageProviderOptionsFromConfig(
  config: ConfigService<CoreApiEnv, true>,
): S3ImageStorageProviderOptions {
  const endpoint = config.getOrThrow('AWS_S3_ENDPOINT', { infer: true });

  return {
    region: config.getOrThrow('AWS_REGION', { infer: true }),
    ...(endpoint ? { endpoint } : {}),
    bucket: config.getOrThrow('AWS_S3_BUCKET', { infer: true }),
    accessKeyId: config.getOrThrow('AWS_ACCESS_KEY_ID', { infer: true }),
    secretAccessKey: config.getOrThrow('AWS_SECRET_ACCESS_KEY', {
      infer: true,
    }),
    forcePathStyle: config.getOrThrow('AWS_S3_FORCE_PATH_STYLE', {
      infer: true,
    }),
    publicBaseUrl: config.getOrThrow('MEDIA_PUBLIC_BASE_URL', {
      infer: true,
    }),
    uploadUrlTtlSeconds: config.getOrThrow('MEDIA_UPLOAD_URL_TTL_SECONDS', {
      infer: true,
    }),
  };
}

export class S3ImageStorageProvider extends ImageStoragePort {
  private readonly client: S3Client;
  private readonly bucket: string;
  private readonly publicBaseUrl: string;
  private readonly uploadUrlTtlSeconds: number;

  constructor(options: S3ImageStorageProviderOptions) {
    super();
    if (
      !options.region ||
      !options.bucket ||
      !options.accessKeyId ||
      !options.secretAccessKey ||
      !options.publicBaseUrl
    ) {
      throw new Error(
        'S3-compatible media storage yêu cầu đầy đủ region, bucket, credential và MEDIA_PUBLIC_BASE_URL',
      );
    }

    this.bucket = options.bucket;
    this.publicBaseUrl = options.publicBaseUrl.replace(/\/+$/u, '');
    this.uploadUrlTtlSeconds = options.uploadUrlTtlSeconds;
    this.client = new S3Client({
      region: options.region,
      ...(options.endpoint ? { endpoint: options.endpoint } : {}),
      forcePathStyle: options.forcePathStyle,
      credentials: {
        accessKeyId: options.accessKeyId,
        secretAccessKey: options.secretAccessKey,
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
