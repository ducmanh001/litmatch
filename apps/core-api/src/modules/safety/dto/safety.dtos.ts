import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsEnum,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
} from 'class-validator';

import { Report, ReportReason } from '../entities/report.entity';

export class CreateReportDto {
  @ApiProperty()
  @IsUUID()
  targetUserId!: string;

  @ApiProperty({ enum: ReportReason })
  @IsEnum(ReportReason)
  reason!: ReportReason;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  description?: string;
}

export class ReportDto {
  @ApiProperty() id!: string;
  @ApiProperty() targetUserId!: string;
  @ApiProperty({ enum: ReportReason }) reason!: ReportReason;
  @ApiProperty() createdAt!: Date;

  /** Chỉ dùng cho report user (`SafetyService.report`) — `targetUserId` luôn có giá trị ở nhánh đó. */
  static from(report: Report): ReportDto {
    const dto = new ReportDto();
    dto.id = report.id;
    dto.targetUserId = report.targetUserId as string;
    dto.reason = report.reason;
    dto.createdAt = report.createdAt;
    return dto;
  }
}

export class BlockStatusDto {
  @ApiProperty() blocked!: boolean;
}
