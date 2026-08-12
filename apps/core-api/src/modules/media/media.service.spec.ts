import { ImageAsset } from './entities/image-asset.entity';
import { ImageAssetPurpose, ImageAssetStatus } from './media.constants';
import { MediaErrors } from './media.errors';
import { MediaService } from './media.service';
import { ImageStoragePort } from './ports/image-storage.port';

import type { ConfigService } from '@nestjs/config';
import type { Repository } from 'typeorm';
import type { AuthenticatedUser } from '../../common/decorators/current-user.decorator';
import type { CoreApiEnv } from '../../config/env.validation';

const user: AuthenticatedUser = {
  userId: 'user-1',
  isGuest: false,
  role: 'user',
};

function makeAsset(overrides: Partial<ImageAsset> = {}): ImageAsset {
  return Object.assign(new ImageAsset(), {
    id: 'asset-1',
    ownerUserId: user.userId,
    storageKey: 'images/user-1/asset-1',
    purpose: ImageAssetPurpose.Post,
    contentType: 'image/png',
    sizeBytes: 1234,
    status: ImageAssetStatus.Pending,
    ...overrides,
  });
}

describe('MediaService', () => {
  let repo: {
    create: jest.Mock;
    save: jest.Mock;
    findOne: jest.Mock;
  };
  let storage: {
    generateStorageKey: jest.Mock;
    generateFinalStorageKey: jest.Mock;
    issueUploadUrl: jest.Mock;
    promote: jest.Mock;
    delete: jest.Mock;
    getPublicUrl: jest.Mock;
    head: jest.Mock;
    readPrefix: jest.Mock;
  };
  let config: ConfigService<CoreApiEnv, true>;
  let service: MediaService;

  beforeEach(() => {
    repo = {
      create: jest.fn((input) => Object.assign(new ImageAsset(), input)),
      save: jest.fn(async (asset) => asset),
      findOne: jest.fn(),
    };
    storage = {
      generateStorageKey: jest.fn(() => 'images/user-1/new'),
      generateFinalStorageKey: jest.fn(
        (_owner: string, assetId: string) => `images/user-1/final/${assetId}`,
      ),
      issueUploadUrl: jest.fn(async () => ({
        uploadUrl: 'https://upload.example.test',
        expiresAt: new Date('2026-08-06T01:05:00.000Z'),
      })),
      getPublicUrl: jest.fn(
        (key: string) => `https://images.example.test/${key}`,
      ),
      head: jest.fn(),
      promote: jest.fn(),
      delete: jest.fn(),
      readPrefix: jest.fn(),
    };
    config = {
      getOrThrow: (key: keyof CoreApiEnv) => {
        const values = {
          MEDIA_ALLOWED_IMAGE_TYPES:
            'image/jpeg,image/png,image/webp,image/gif',
          MEDIA_IMAGE_MAX_BYTES: 5_000_000,
          MEDIA_STORAGE_PROVIDER: 'dev',
        } as const;
        if (!(key in values)) throw new Error(`missing config ${key}`);
        return values[key as keyof typeof values];
      },
    } as unknown as ConfigService<CoreApiEnv, true>;
    service = new MediaService(
      repo as unknown as Repository<ImageAsset>,
      storage as unknown as ImageStoragePort,
      config,
    );
  });

  it('tạo pending asset và presigned URL theo metadata client khai báo', async () => {
    const result = await service.createUploadIntent(user, {
      purpose: ImageAssetPurpose.Post,
      contentType: 'image/png',
      sizeBytes: 1234,
    });

    expect(repo.create).toHaveBeenCalledWith(
      expect.objectContaining({
        ownerUserId: user.userId,
        purpose: ImageAssetPurpose.Post,
        contentType: 'image/png',
        sizeBytes: 1234,
        status: ImageAssetStatus.Pending,
      }),
    );
    expect(storage.issueUploadUrl).toHaveBeenCalledWith(
      'images/user-1/new',
      'image/png',
    );
    expect(result.assetId).toBeDefined();
  });

  it('chặn guest, MIME ngoài allowlist và file quá lớn trước khi ghi DB', async () => {
    await expect(
      service.createUploadIntent(
        { ...user, isGuest: true },
        {
          purpose: ImageAssetPurpose.Post,
          contentType: 'image/png',
          sizeBytes: 1,
        },
      ),
    ).rejects.toMatchObject({ code: MediaErrors.GUEST_FORBIDDEN });
    await expect(
      service.createUploadIntent(user, {
        purpose: ImageAssetPurpose.Post,
        contentType: 'text/html',
        sizeBytes: 1,
      }),
    ).rejects.toMatchObject({ code: MediaErrors.INVALID_CONTENT_TYPE });
    await expect(
      service.createUploadIntent(user, {
        purpose: ImageAssetPurpose.Post,
        contentType: 'image/png',
        sizeBytes: 5_000_001,
      }),
    ).rejects.toMatchObject({ code: MediaErrors.FILE_TOO_LARGE });
    expect(repo.save).not.toHaveBeenCalled();
  });

  it('query theo owner + purpose và không resolve asset của user khác', async () => {
    repo.findOne.mockResolvedValue(null);
    await expect(
      service.resolveImageUrl('other-user', 'asset-1', ImageAssetPurpose.Post),
    ).rejects.toMatchObject({ code: MediaErrors.ASSET_NOT_FOUND });
    expect(repo.findOne).toHaveBeenCalledWith({
      where: { id: 'asset-1', ownerUserId: 'other-user' },
    });

    repo.findOne.mockResolvedValue(
      makeAsset({ purpose: ImageAssetPurpose.Message }),
    );
    await expect(
      service.resolveImageUrl(user.userId, 'asset-1', ImageAssetPurpose.Post),
    ).rejects.toMatchObject({ code: MediaErrors.ASSET_NOT_FOUND });
  });

  it('R2 asset pending chỉ ready sau khi HEAD khớp size + content type', async () => {
    config = {
      getOrThrow: (key: keyof CoreApiEnv) => {
        if (key === 'MEDIA_STORAGE_PROVIDER') return 'r2';
        if (key === 'MEDIA_ALLOWED_IMAGE_TYPES') return 'image/png';
        if (key === 'MEDIA_IMAGE_MAX_BYTES') return 5_000_000;
        throw new Error(`missing config ${key}`);
      },
    } as unknown as ConfigService<CoreApiEnv, true>;
    service = new MediaService(
      repo as unknown as Repository<ImageAsset>,
      storage as unknown as ImageStoragePort,
      config,
    );
    repo.findOne.mockResolvedValue(makeAsset());
    storage.head.mockImplementation(async (key: string) =>
      key.includes('/final/')
        ? null
        : { sizeBytes: 1234, contentType: 'image/png' },
    );
    storage.readPrefix.mockResolvedValue(
      new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]),
    );

    await expect(
      service.resolveImageUrl(user.userId, 'asset-1', ImageAssetPurpose.Post),
    ).resolves.toContain('images/user-1/final/asset-1');
    expect(repo.save).toHaveBeenCalledWith(
      expect.objectContaining({
        status: ImageAssetStatus.Ready,
        storageKey: 'images/user-1/final/asset-1',
      }),
    );
    expect(storage.promote).toHaveBeenCalledWith(
      'images/user-1/asset-1',
      'images/user-1/final/asset-1',
    );
  });

  it('R2 asset chưa tồn tại hoặc metadata lệch thì không được attach', async () => {
    config = {
      getOrThrow: (key: keyof CoreApiEnv) => {
        if (key === 'MEDIA_STORAGE_PROVIDER') return 'r2';
        if (key === 'MEDIA_ALLOWED_IMAGE_TYPES') return 'image/png';
        if (key === 'MEDIA_IMAGE_MAX_BYTES') return 5_000_000;
        throw new Error(`missing config ${key}`);
      },
    } as unknown as ConfigService<CoreApiEnv, true>;
    service = new MediaService(
      repo as unknown as Repository<ImageAsset>,
      storage as unknown as ImageStoragePort,
      config,
    );
    const asset = makeAsset();
    repo.findOne.mockResolvedValue(asset);
    storage.head.mockImplementation(async (key: string) =>
      key.includes('/final/') ? null : null,
    );
    await expect(
      service.resolveImageUrl(user.userId, 'asset-1'),
    ).rejects.toMatchObject({ code: MediaErrors.ASSET_NOT_READY });
    storage.head.mockResolvedValue({ sizeBytes: 1, contentType: 'image/png' });
    await expect(
      service.resolveImageUrl(user.userId, 'asset-1'),
    ).rejects.toMatchObject({ code: MediaErrors.ASSET_NOT_READY });
    expect(asset.status).toBe(ImageAssetStatus.Pending);
  });

  it('R2 asset có magic bytes không khớp thì bị xoá quarantine và không promote', async () => {
    config = {
      getOrThrow: (key: keyof CoreApiEnv) => {
        if (key === 'MEDIA_STORAGE_PROVIDER') return 'r2';
        if (key === 'MEDIA_ALLOWED_IMAGE_TYPES') return 'image/png';
        if (key === 'MEDIA_IMAGE_MAX_BYTES') return 5_000_000;
        throw new Error(`missing config ${key}`);
      },
    } as unknown as ConfigService<CoreApiEnv, true>;
    service = new MediaService(
      repo as unknown as Repository<ImageAsset>,
      storage as unknown as ImageStoragePort,
      config,
    );
    repo.findOne.mockResolvedValue(makeAsset());
    storage.head.mockImplementation(async (key: string) =>
      key.includes('/final/')
        ? null
        : { sizeBytes: 1234, contentType: 'image/png' },
    );
    storage.readPrefix.mockResolvedValue(new Uint8Array([0x3c, 0x68, 0x74]));

    await expect(
      service.resolveImageUrl(user.userId, 'asset-1'),
    ).rejects.toMatchObject({ code: MediaErrors.ASSET_NOT_READY });
    expect(storage.delete).toHaveBeenCalledWith('images/user-1/asset-1');
    expect(storage.promote).not.toHaveBeenCalled();
  });
});
