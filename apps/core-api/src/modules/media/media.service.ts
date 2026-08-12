import { HttpStatus, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { DomainException } from '@litmatch/common-exceptions';
import { randomUUID } from 'node:crypto';
import { Repository } from 'typeorm';

import type { AuthenticatedUser } from '../../common/decorators/current-user.decorator';
import type { CoreApiEnv } from '../../config/env.validation';
import { ImageAsset } from './entities/image-asset.entity';
import { ImageAssetPurpose, ImageAssetStatus } from './media.constants';
import { MediaErrors } from './media.errors';
import { ImageStoragePort } from './ports/image-storage.port';

export interface CreateImageUploadIntentInput {
  purpose: ImageAssetPurpose;
  contentType: string;
  sizeBytes: number;
}

export interface ImageUploadIntentResult {
  assetId: string;
  uploadUrl: string;
  publicUrl: string;
  expiresAt: Date;
}

@Injectable()
export class MediaService {
  constructor(
    @InjectRepository(ImageAsset)
    private readonly assetRepo: Repository<ImageAsset>,
    private readonly storage: ImageStoragePort,
    private readonly config: ConfigService<CoreApiEnv, true>,
  ) {}

  async createUploadIntent(
    user: AuthenticatedUser,
    input: CreateImageUploadIntentInput,
  ): Promise<ImageUploadIntentResult> {
    this.assertNotGuest(user);
    this.assertAllowedContentType(input.contentType);
    const maxBytes = this.config.getOrThrow('MEDIA_IMAGE_MAX_BYTES', {
      infer: true,
    });
    if (input.sizeBytes <= 0 || input.sizeBytes > maxBytes) {
      throw new DomainException(
        MediaErrors.FILE_TOO_LARGE,
        `Ảnh vượt quá giới hạn ${maxBytes} bytes`,
        HttpStatus.UNPROCESSABLE_ENTITY,
        { maxBytes },
      );
    }

    const asset = this.assetRepo.create({
      id: randomUUID(),
      ownerUserId: user.userId,
      storageKey: this.storage.generateStorageKey(user.userId),
      purpose: input.purpose,
      contentType: input.contentType,
      sizeBytes: input.sizeBytes,
      status: ImageAssetStatus.Pending,
    });
    const upload = await this.storage.issueUploadUrl(
      asset.storageKey,
      asset.contentType,
    );
    await this.assetRepo.save(asset);
    return {
      assetId: asset.id,
      uploadUrl: upload.uploadUrl,
      // Final URL is deterministic but remains empty until validation + promotion finish.
      publicUrl: this.storage.getPublicUrl(
        this.storage.generateFinalStorageKey(user.userId, asset.id),
      ),
      expiresAt: upload.expiresAt,
    };
  }

  async resolveImageUrl(
    ownerUserId: string,
    assetId: string,
    expectedPurpose?: ImageAssetPurpose,
  ): Promise<string> {
    const asset = await this.assetRepo.findOne({
      where: { id: assetId, ownerUserId },
    });
    if (!asset) {
      throw new DomainException(
        MediaErrors.ASSET_NOT_FOUND,
        'Không tìm thấy ảnh đã upload',
        HttpStatus.NOT_FOUND,
      );
    }
    if (expectedPurpose !== undefined && asset.purpose !== expectedPurpose) {
      throw new DomainException(
        MediaErrors.ASSET_NOT_FOUND,
        'Không tìm thấy ảnh đã upload',
        HttpStatus.NOT_FOUND,
      );
    }
    if (asset.status !== ImageAssetStatus.Ready) {
      const provider = this.config.getOrThrow('MEDIA_STORAGE_PROVIDER', {
        infer: true,
      });
      if (provider !== 'dev') {
        const finalStorageKey = this.storage.generateFinalStorageKey(
          ownerUserId,
          asset.id,
        );
        const finalObject = await this.storage.head(finalStorageKey);
        if (finalObject === null) {
          await this.assertUploadedImage(asset);
          await this.storage.promote(asset.storageKey, finalStorageKey);
        } else {
          await this.assertUploadedImage(asset, finalStorageKey);
        }
        asset.storageKey = finalStorageKey;
      } else {
        asset.storageKey = this.storage.generateFinalStorageKey(
          ownerUserId,
          asset.id,
        );
      }
      asset.status = ImageAssetStatus.Ready;
      await this.assetRepo.save(asset);
    }
    return this.storage.getPublicUrl(asset.storageKey);
  }

  private async assertUploadedImage(
    asset: ImageAsset,
    storageKey = asset.storageKey,
  ): Promise<void> {
    const object = await this.storage.head(storageKey);
    if (
      object === null ||
      object.sizeBytes !== asset.sizeBytes ||
      object.contentType !== asset.contentType
    ) {
      if (object !== null) await this.storage.delete(storageKey);
      throw new DomainException(
        MediaErrors.ASSET_NOT_READY,
        'Ảnh chưa upload hoàn tất hoặc metadata không hợp lệ',
        HttpStatus.UNPROCESSABLE_ENTITY,
      );
    }

    const prefix = await this.storage.readPrefix(storageKey);
    if (this.detectImageMime(prefix) !== asset.contentType) {
      await this.storage.delete(storageKey);
      throw new DomainException(
        MediaErrors.ASSET_NOT_READY,
        'Nội dung ảnh không khớp định dạng đã khai báo',
        HttpStatus.UNPROCESSABLE_ENTITY,
      );
    }
  }

  private detectImageMime(prefix: Uint8Array | null): string | undefined {
    if (prefix === null) return undefined;
    if (
      prefix.length >= 8 &&
      prefix[0] === 0x89 &&
      prefix[1] === 0x50 &&
      prefix[2] === 0x4e &&
      prefix[3] === 0x47 &&
      prefix[4] === 0x0d &&
      prefix[5] === 0x0a &&
      prefix[6] === 0x1a &&
      prefix[7] === 0x0a
    ) {
      return 'image/png';
    }
    if (
      prefix.length >= 3 &&
      prefix[0] === 0xff &&
      prefix[1] === 0xd8 &&
      prefix[2] === 0xff
    ) {
      return 'image/jpeg';
    }
    if (
      prefix.length >= 6 &&
      prefix[0] === 0x47 &&
      prefix[1] === 0x49 &&
      prefix[2] === 0x46 &&
      prefix[3] === 0x38 &&
      (prefix[4] === 0x37 || prefix[4] === 0x39) &&
      prefix[5] === 0x61
    ) {
      return 'image/gif';
    }
    if (
      prefix.length >= 12 &&
      prefix[0] === 0x52 &&
      prefix[1] === 0x49 &&
      prefix[2] === 0x46 &&
      prefix[3] === 0x46 &&
      prefix[8] === 0x57 &&
      prefix[9] === 0x45 &&
      prefix[10] === 0x42 &&
      prefix[11] === 0x50
    ) {
      return 'image/webp';
    }
    return undefined;
  }

  private assertAllowedContentType(contentType: string): void {
    const allowed = this.config
      .getOrThrow('MEDIA_ALLOWED_IMAGE_TYPES', { infer: true })
      .split(',')
      .map((value) => value.trim());
    if (!allowed.includes(contentType)) {
      throw new DomainException(
        MediaErrors.INVALID_CONTENT_TYPE,
        'Định dạng ảnh không được hỗ trợ',
        HttpStatus.UNPROCESSABLE_ENTITY,
      );
    }
  }

  private assertNotGuest(user: AuthenticatedUser): void {
    if (user.isGuest) {
      throw new DomainException(
        MediaErrors.GUEST_FORBIDDEN,
        'Guest chưa thể upload ảnh',
        HttpStatus.FORBIDDEN,
      );
    }
  }
}
