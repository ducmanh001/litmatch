import { ApiProperty } from '@nestjs/swagger';
import {
  IsBoolean,
  IsEnum,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';

import { IapProvider, VipTier } from '../../economy';
import {
  BroadcastAudience,
  BroadcastStatus,
} from '../entities/notification-broadcast.entity';

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

export { BroadcastAudience };

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

/** Broadcast chạy nền: response chỉ xác nhận đã xếp hàng; tiến độ lấy qua GET .../broadcast/:id. */
export class BroadcastNotificationResultDto {
  @ApiProperty() broadcastId!: string;
  @ApiProperty({ enum: BroadcastStatus }) status!: BroadcastStatus;
}

export class BroadcastStatusDto {
  @ApiProperty() broadcastId!: string;
  @ApiProperty({ enum: BroadcastStatus }) status!: BroadcastStatus;
  @ApiProperty({ enum: BroadcastAudience }) audience!: BroadcastAudience;
  /** Số người đã nhận tới thời điểm hiện tại (tăng dần khi job nền chạy). */
  @ApiProperty() recipientCount!: number;
  @ApiProperty({ type: String, format: 'date-time' }) createdAt!: Date;
  @ApiProperty({ type: String, format: 'date-time', nullable: true })
  startedAt!: Date | null;
  @ApiProperty({ type: String, format: 'date-time', nullable: true })
  completedAt!: Date | null;
  /** Chỉ có khi lô gần nhất lỗi; rỗng khi đang chạy bình thường. */
  @ApiProperty({ type: String, nullable: true }) lastError!: string | null;
}
