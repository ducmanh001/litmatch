import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';

import type { CoreApiEnv } from '../../config/env.validation';
import { ImageAsset } from './entities/image-asset.entity';
import { MediaController } from './media.controller';
import { MediaService } from './media.service';
import { DevImageStorageProvider } from './ports/dev-image-storage.provider';
import { ImageStoragePort } from './ports/image-storage.port';
import { R2ImageStorageProvider } from './ports/r2-image-storage.provider';
import {
  S3ImageStorageProvider,
  s3ImageStorageProviderOptionsFromConfig,
} from './ports/s3-image-storage.provider';

@Module({
  imports: [TypeOrmModule.forFeature([ImageAsset])],
  controllers: [MediaController],
  providers: [
    MediaService,
    {
      provide: ImageStoragePort,
      inject: [ConfigService],
      useFactory: (config: ConfigService<CoreApiEnv, true>) => {
        const provider = config.getOrThrow('MEDIA_STORAGE_PROVIDER', {
          infer: true,
        });
        if (provider === 'r2') return new R2ImageStorageProvider(config);
        if (provider === 's3' || provider === 'minio') {
          return new S3ImageStorageProvider(
            s3ImageStorageProviderOptionsFromConfig(config),
          );
        }
        return new DevImageStorageProvider(config);
      },
    },
  ],
  exports: [MediaService],
})
export class MediaModule {}
