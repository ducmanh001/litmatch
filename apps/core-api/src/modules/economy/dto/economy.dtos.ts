import { ApiProperty } from '@nestjs/swagger';
import {
  IsEnum,
  IsNotEmpty,
  IsObject,
  IsString,
  Length,
} from 'class-validator';

import { IapProvider } from '../entities/iap.entities';
import { VipTier } from '../entities/wallet.entity';

export class VerifyIapDto {
  @ApiProperty({ enum: IapProvider })
  @IsEnum(IapProvider)
  provider!: IapProvider;

  @ApiProperty({ example: 'com.litmatch.diamond.100' })
  @IsString()
  @Length(1, 128)
  productId!: string;

  @ApiProperty({
    type: 'object',
    additionalProperties: true,
    description:
      'Payload theo provider: apple {receiptData}, google {purchaseToken}; dev verifier nhận {devTransactionId}',
  })
  @IsObject()
  payload!: Record<string, unknown>;
}

export class PurchaseVipDto {
  @ApiProperty({ example: 'vip-30d' })
  @IsString()
  @IsNotEmpty()
  planId!: string;
}

export class IapProductDto {
  @ApiProperty({ example: 'com.litmatch.diamond.100' })
  productId!: string;
  @ApiProperty({ enum: IapProvider })
  provider!: IapProvider;
  @ApiProperty({
    example: '100',
    description: 'Số diamond nhận được (bigint dạng chuỗi)',
  })
  diamonds!: string;
}

export class VipPlanDto {
  @ApiProperty({ example: 'vip-30d' })
  id!: string;

  @ApiProperty({ enum: VipTier })
  tier!: VipTier;

  @ApiProperty({ example: 30 })
  days!: number;

  @ApiProperty({
    example: '500',
    description: 'Giá gói bằng diamond (bigint dạng chuỗi)',
  })
  priceDiamond!: string;
}

export class VipPurchaseResultDto {
  @ApiProperty() transactionId!: string;
  @ApiProperty({ enum: VipTier }) tier!: VipTier;
  @ApiProperty({ type: Date }) vipExpiresAt!: Date;
  @ApiProperty() replayed!: boolean;
}

export class WalletDto {
  @ApiProperty({
    example: '1200',
    description: 'Số dư diamond (chuỗi — bigint)',
  })
  balance!: string;
  @ApiProperty({ example: '0', description: 'Điểm quy đổi từ gift (PTS)' })
  earnings!: string;
  @ApiProperty({
    enum: VipTier,
    nullable: true,
    description: 'Đã derive hết hạn — null nếu không còn active',
  })
  vipTier!: VipTier | null;
  @ApiProperty({ nullable: true, type: Date }) vipExpiresAt!: Date | null;
}
