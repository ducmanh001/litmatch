import { Column, Entity, Index } from 'typeorm';

import { BaseAppEntity } from '../../../common/entities/base.entity';
import { ImageAssetPurpose, ImageAssetStatus } from '../media.constants';

@Entity({ name: 'image_assets' })
@Index('idx_image_assets_owner_created', ['ownerUserId', 'createdAt'])
@Index('idx_image_assets_owner_status', ['ownerUserId', 'status'])
export class ImageAsset extends BaseAppEntity {
  @Column({ type: 'uuid' })
  ownerUserId!: string;

  @Column({ type: 'varchar', length: 1024, unique: true })
  storageKey!: string;

  @Column({ type: 'varchar', length: 16 })
  purpose!: ImageAssetPurpose;

  @Column({ type: 'varchar', length: 64 })
  contentType!: string;

  @Column({ type: 'int' })
  sizeBytes!: number;

  @Column({ type: 'varchar', length: 16, default: ImageAssetStatus.Pending })
  status!: ImageAssetStatus;
}
