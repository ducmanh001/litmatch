import { ApiProperty } from '@nestjs/swagger';
import { IsEnum, IsInt, IsString, Max, MaxLength, Min } from 'class-validator';

import { ImageAssetPurpose, MAX_IMAGE_UPLOAD_BYTES } from '../media.constants';

import type { ImageUploadIntentResult } from '../media.service';

export class CreateImageUploadIntentDto {
  @ApiProperty({ enum: ImageAssetPurpose })
  @IsEnum(ImageAssetPurpose)
  purpose!: ImageAssetPurpose;

  @ApiProperty({ example: 'image/jpeg' })
  @IsString()
  @MaxLength(64)
  contentType!: string;

  @ApiProperty({ minimum: 1, maximum: MAX_IMAGE_UPLOAD_BYTES })
  @IsInt()
  @Min(1)
  @Max(MAX_IMAGE_UPLOAD_BYTES)
  sizeBytes!: number;
}

export class ImageUploadIntentDto {
  @ApiProperty() assetId!: string;
  @ApiProperty() uploadUrl!: string;
  @ApiProperty() publicUrl!: string;
  @ApiProperty() expiresAt!: Date;

  static from(input: ImageUploadIntentResult): ImageUploadIntentDto {
    const dto = new ImageUploadIntentDto();
    dto.assetId = input.assetId;
    dto.uploadUrl = input.uploadUrl;
    dto.publicUrl = input.publicUrl;
    dto.expiresAt = input.expiresAt;
    return dto;
  }
}
