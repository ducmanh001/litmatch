import { ApiProperty } from '@nestjs/swagger';
import { IsEnum, IsUUID } from 'class-validator';

import { AvatarAsset, AvatarSlot } from '../entities/avatar-asset.entity';

export class AvatarAssetDto {
  @ApiProperty() id!: string;
  @ApiProperty({ enum: AvatarSlot }) slot!: AvatarSlot;
  @ApiProperty() code!: string;
  @ApiProperty() name!: string;
  @ApiProperty() imageUrl!: string;
  @ApiProperty() zIndex!: number;
  @ApiProperty() priceDiamond!: number;

  static from(asset: AvatarAsset): AvatarAssetDto {
    const dto = new AvatarAssetDto();
    dto.id = asset.id;
    dto.slot = asset.slot;
    dto.code = asset.code;
    dto.name = asset.name;
    dto.imageUrl = asset.imageUrl;
    dto.zIndex = asset.zIndex;
    dto.priceDiamond = asset.priceDiamond;
    return dto;
  }
}

export class EquipAvatarItemDto {
  @ApiProperty({ enum: AvatarSlot })
  @IsEnum(AvatarSlot)
  slot!: AvatarSlot;

  @ApiProperty()
  @IsUUID()
  avatarAssetId!: string;
}

export class AvatarConfigDto {
  @ApiProperty() userId!: string;
  /** Sắp theo zIndex — client ghép layer theo đúng thứ tự này. */
  @ApiProperty({ type: [AvatarAssetDto] }) layers!: AvatarAssetDto[];
}
