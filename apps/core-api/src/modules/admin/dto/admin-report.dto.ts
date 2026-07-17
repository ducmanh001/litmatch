import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsEnum, IsInt, IsOptional, Max, Min } from 'class-validator';
import {
  Report,
  ReportReason,
  ReportStatus,
  ReportTargetType,
} from '../../safety';

import type { ReportPage } from '../../safety';

/** Query cho GET /admin/reports — offset OK vì list nhỏ (docs/05 § 5.4). */
export class ListReportsQueryDto {
  @ApiPropertyOptional({ enum: ReportStatus })
  @IsOptional()
  @IsEnum(ReportStatus)
  status?: ReportStatus;

  @ApiPropertyOptional({ default: 20 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit = 20;

  @ApiPropertyOptional({ default: 0 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  offset = 0;
}

export class AdminReportDto {
  @ApiProperty() id!: string;
  @ApiProperty() reporterUserId!: string;
  @ApiProperty({ enum: ReportTargetType }) targetType!: ReportTargetType;
  @ApiProperty({ nullable: true, type: String }) targetUserId!: string | null;
  @ApiProperty({ nullable: true, type: String }) targetVideoId!: string | null;
  @ApiProperty({ enum: ReportReason }) reason!: ReportReason;
  @ApiProperty({ nullable: true }) description!: string | null;
  @ApiProperty() trustPenaltyApplied!: number;
  @ApiProperty({ enum: ReportStatus }) status!: ReportStatus;
  @ApiProperty() createdAt!: Date;

  static from(report: Report): AdminReportDto {
    const dto = new AdminReportDto();
    dto.id = report.id;
    dto.reporterUserId = report.reporterUserId;
    dto.targetType = report.targetType;
    dto.targetUserId = report.targetUserId;
    dto.targetVideoId = report.targetVideoId;
    dto.reason = report.reason;
    dto.description = report.description;
    dto.trustPenaltyApplied = report.trustPenaltyApplied;
    dto.status = report.status;
    dto.createdAt = report.createdAt;
    return dto;
  }
}

export class AdminReportsPageDto {
  @ApiProperty({ type: [AdminReportDto] }) items!: AdminReportDto[];
  @ApiProperty() total!: number;

  static from(page: ReportPage): AdminReportsPageDto {
    const dto = new AdminReportsPageDto();
    dto.items = page.items.map(AdminReportDto.from);
    dto.total = page.total;
    return dto;
  }
}
