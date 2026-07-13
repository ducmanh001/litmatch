import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsBoolean,
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import { Gift } from '../../gift';

export class AdminGiftDto {
  @ApiProperty() id!: string;
  @ApiProperty() code!: string;
  @ApiProperty() name!: string;
  @ApiProperty() priceDiamond!: number;
  @ApiProperty() active!: boolean;
  @ApiProperty() sortOrder!: number;
  @ApiProperty() createdAt!: Date;
  @ApiProperty() updatedAt!: Date;

  static from(gift: Gift): AdminGiftDto {
    const dto = new AdminGiftDto();
    dto.id = gift.id;
    dto.code = gift.code;
    dto.name = gift.name;
    dto.priceDiamond = gift.priceDiamond;
    dto.active = gift.active;
    dto.sortOrder = gift.sortOrder;
    dto.createdAt = gift.createdAt;
    dto.updatedAt = gift.updatedAt;
    return dto;
  }
}

export class CreateGiftDto {
  @ApiProperty()
  @IsString()
  @MaxLength(64)
  code!: string;

  @ApiProperty()
  @IsString()
  @MaxLength(128)
  name!: string;

  @ApiProperty()
  @IsInt()
  @Min(1)
  priceDiamond!: number;

  @ApiPropertyOptional({ default: 0 })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(9999)
  sortOrder?: number;
}

export class UpdateGiftDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(128)
  name?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  @Min(1)
  priceDiamond?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(9999)
  sortOrder?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  active?: boolean;
}
