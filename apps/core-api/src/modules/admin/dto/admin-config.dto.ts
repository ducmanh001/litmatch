import { ApiProperty } from '@nestjs/swagger';
import {
  IsBoolean,
  IsEnum,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';

import { IapProvider, VipTier } from '../../economy';

import type { IapProductCatalogView, VipPlanCatalogView } from '../../economy';

export class AdminIapProductDto {
  @ApiProperty() productId!: string;
  @ApiProperty({ enum: IapProvider }) provider!: IapProvider;
  @ApiProperty() diamonds!: string;
  @ApiProperty() active!: boolean;

  static from(product: IapProductCatalogView): AdminIapProductDto {
    return { ...product };
  }
}

export class AdminVipPlanDto {
  @ApiProperty() id!: string;
  @ApiProperty({ enum: VipTier }) tier!: VipTier;
  @ApiProperty() days!: number;
  @ApiProperty() priceDiamond!: string;
  @ApiProperty() active!: boolean;

  static from(plan: VipPlanCatalogView): AdminVipPlanDto {
    return { ...plan };
  }
}

export class AdminEconomyCatalogDto {
  @ApiProperty({ type: [AdminIapProductDto] })
  iapProducts!: AdminIapProductDto[];

  @ApiProperty({ type: [AdminVipPlanDto] })
  vipPlans!: AdminVipPlanDto[];
}

export class SetCatalogActiveDto {
  @ApiProperty()
  @IsBoolean()
  active!: boolean;
}

export enum BroadcastAudience {
  All = 'all',
  Vip = 'vip',
  Free = 'free',
}

export class BroadcastNotificationDto {
  @ApiProperty({ maxLength: 120 })
  @IsString()
  @MinLength(1)
  @MaxLength(120)
  title!: string;

  @ApiProperty({ maxLength: 500 })
  @IsString()
  @MinLength(1)
  @MaxLength(500)
  body!: string;

  @ApiProperty({ enum: BroadcastAudience })
  @IsEnum(BroadcastAudience)
  audience!: BroadcastAudience;
}

export class BroadcastNotificationResultDto {
  @ApiProperty() broadcastId!: string;
  @ApiProperty() recipientCount!: number;
}
