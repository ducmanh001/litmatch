import {
  CopyObjectCommand,
  DeleteObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  PutObjectCommand,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

import {
  S3ImageStorageProvider,
  s3ImageStorageProviderOptionsFromConfig,
} from './s3-image-storage.provider';

import type { ConfigService } from '@nestjs/config';
import type { CoreApiEnv } from '../../../config/env.validation';

jest.mock('@aws-sdk/s3-request-presigner', () => ({
  getSignedUrl: jest.fn(),
}));

describe('S3ImageStorageProvider', () => {
  const options = {
    region: 'us-east-1',
    endpoint: 'http://minio:9000',
    bucket: 'litmatch-images',
    accessKeyId: 'access-key',
    secretAccessKey: 'secret-key',
    forcePathStyle: true,
    publicBaseUrl: 'http://minio:9000/litmatch-images/',
    uploadUrlTtlSeconds: 900,
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  function providerWithClient() {
    const provider = new S3ImageStorageProvider(options);
    const client = { send: jest.fn() };
    Object.defineProperty(provider, 'client', {
      configurable: true,
      value: client,
    });
    return { provider, client };
  }

  it('issues presigned PUT with the declared content type', async () => {
    const { provider } = providerWithClient();
    jest.mocked(getSignedUrl).mockResolvedValue('https://signed.example/put');

    const result = await provider.issueUploadUrl(
      'images/user-1/pending',
      'image/png',
    );

    expect(result.uploadUrl).toBe('https://signed.example/put');
    expect(jest.mocked(getSignedUrl)).toHaveBeenCalledWith(
      expect.anything(),
      expect.any(PutObjectCommand),
      { expiresIn: 900 },
    );
    const command = jest.mocked(getSignedUrl).mock.calls[0]?.[1];
    expect(command).toBeInstanceOf(PutObjectCommand);
    expect(command?.input).toMatchObject({
      Bucket: 'litmatch-images',
      Key: 'images/user-1/pending',
      ContentType: 'image/png',
    });
  });

  it('uses the same S3 command transport for head, read, promote and delete', async () => {
    const { provider, client } = providerWithClient();
    client.send
      .mockResolvedValueOnce({ ContentLength: 12, ContentType: 'image/png' })
      .mockResolvedValueOnce({
        Body: {
          transformToByteArray: async () => new Uint8Array([137, 80, 78, 71]),
        },
      })
      .mockResolvedValue(undefined);

    await expect(provider.head('pending/key')).resolves.toEqual({
      sizeBytes: 12,
      contentType: 'image/png',
    });
    await expect(provider.readPrefix('pending/key')).resolves.toEqual(
      new Uint8Array([137, 80, 78, 71]),
    );
    await provider.promote('pending/key', 'images/user-1/asset-1');

    expect(client.send).toHaveBeenNthCalledWith(
      1,
      expect.any(HeadObjectCommand),
    );
    expect(client.send).toHaveBeenNthCalledWith(
      2,
      expect.any(GetObjectCommand),
    );
    expect(client.send).toHaveBeenNthCalledWith(
      3,
      expect.any(CopyObjectCommand),
    );
    expect(client.send).toHaveBeenNthCalledWith(
      4,
      expect.any(DeleteObjectCommand),
    );
    expect((client.send.mock.calls[2]?.[0] as CopyObjectCommand).input).toEqual(
      expect.objectContaining({
        Bucket: 'litmatch-images',
        CopySource: 'litmatch-images/pending%2Fkey',
        Key: 'images/user-1/asset-1',
        MetadataDirective: 'COPY',
      }),
    );
  });

  it('maps AWS and MinIO environment config without changing the media port', () => {
    const values: Record<string, string | boolean | number> = {
      AWS_REGION: 'ap-southeast-1',
      AWS_S3_ENDPOINT: 'http://minio:9000',
      AWS_S3_BUCKET: 'images',
      AWS_ACCESS_KEY_ID: 'minio-access',
      AWS_SECRET_ACCESS_KEY: 'minio-secret',
      AWS_S3_FORCE_PATH_STYLE: true,
      MEDIA_PUBLIC_BASE_URL: 'http://minio:9000/images',
      MEDIA_UPLOAD_URL_TTL_SECONDS: 600,
    };
    const config = {
      getOrThrow: (key: keyof CoreApiEnv) => values[key],
    } as unknown as ConfigService<CoreApiEnv, true>;

    expect(s3ImageStorageProviderOptionsFromConfig(config)).toEqual({
      region: 'ap-southeast-1',
      endpoint: 'http://minio:9000',
      bucket: 'images',
      accessKeyId: 'minio-access',
      secretAccessKey: 'minio-secret',
      forcePathStyle: true,
      publicBaseUrl: 'http://minio:9000/images',
      uploadUrlTtlSeconds: 600,
    });
  });

  it('rejects an incomplete S3 profile before the app can boot', () => {
    expect(
      () =>
        new S3ImageStorageProvider({
          ...options,
          secretAccessKey: '',
        }),
    ).toThrow('S3-compatible media storage');
  });
});
