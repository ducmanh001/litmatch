import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString, MaxLength } from 'class-validator';
import { VipTier } from '../../economy';

import type { TransactionType, WalletView } from '../../economy';

/** Ví nội bộ cho admin xem — cùng shape `WalletView`, DTO riêng vì economy.dtos.ts không export. */
export class AdminWalletDto {
  @ApiProperty() balance!: string;
  @ApiProperty() earnings!: string;
  @ApiProperty({ enum: VipTier, nullable: true }) vipTier!: VipTier | null;
  @ApiProperty({ nullable: true, type: Date }) vipExpiresAt!: Date | null;

  static from(wallet: WalletView): AdminWalletDto {
    const dto = new AdminWalletDto();
    dto.balance = wallet.balance;
    dto.earnings = wallet.earnings;
    dto.vipTier = wallet.vipTier;
    dto.vipExpiresAt = wallet.vipExpiresAt;
    return dto;
  }
}

export class AdminTransactionDto {
  @ApiProperty() id!: string;
  @ApiProperty() type!: TransactionType;
  @ApiProperty() status!: string;
  @ApiProperty({
    description:
      'Diamond delta THEO ví user này — actor-scoped (docs/12 § 12.7: chưa thấy giao dịch nhận quà, chỉ giao dịch user chủ động thực hiện)',
  })
  diamondDelta!: string;
  @ApiProperty() createdAt!: Date;
}

export class AdminTransactionsPageDto {
  @ApiProperty({ type: [AdminTransactionDto] }) items!: AdminTransactionDto[];
  @ApiProperty({ nullable: true }) nextCursor!: string | null;
}

export class RefundTransactionDto {
  @ApiProperty({ description: 'Lý do hoàn tiền — bắt buộc để audit lại được' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(500)
  reason!: string;
}

export class RefundResultDto {
  @ApiProperty() transactionId!: string;
  @ApiProperty() reversalTransactionId!: string;
}
