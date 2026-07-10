import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Length,
  Matches,
  Max,
  Min,
  ValidateNested,
} from 'class-validator';

import {
  EvidenceContentType,
  EvidenceKind,
  EvidenceVerificationStatus,
} from '../entities/report-evidence-metadata.entity';
import { ReportCategory, ReportPriority, ReportStatus } from '../entities/report.entity';
import { UserBlock, UserBlockStatus } from '../entities/user-block.entity';

export class CreateBlockDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  blockedUserId!: string;
}

export class ReportEvidenceMetadataDto {
  @ApiProperty({ enum: EvidenceKind })
  @IsEnum(EvidenceKind)
  kind!: EvidenceKind;

  @ApiProperty({ format: 'uuid', description: 'ID của resource do server quản lý; không nhận URL/blob/base64' })
  @IsUUID()
  referenceId!: string;

  @ApiPropertyOptional({ example: 'a'.repeat(64) })
  @IsOptional()
  @IsString()
  @Matches(/^[a-f0-9]{64}$/)
  sha256?: string;

  @ApiPropertyOptional({ enum: EvidenceContentType })
  @IsOptional()
  @IsEnum(EvidenceContentType)
  contentType?: EvidenceContentType;

  @ApiPropertyOptional({ minimum: 1, maximum: 52_428_800 })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(52_428_800)
  byteSize?: number;
}

export class CreateReportDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  reportedUserId!: string;

  @ApiProperty({ enum: ReportCategory })
  @IsEnum(ReportCategory)
  category!: ReportCategory;

  @ApiPropertyOptional({ maxLength: 500, description: 'Tóm tắt ngắn; không gửi binary/base64' })
  @IsOptional()
  @IsString()
  @Length(1, 500)
  summary?: string;

  @ApiPropertyOptional({ type: [ReportEvidenceMetadataDto], maxItems: 5 })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(5)
  @ValidateNested({ each: true })
  @Type(() => ReportEvidenceMetadataDto)
  evidence?: ReportEvidenceMetadataDto[];
}

export class UserBlockDto {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty({ format: 'uuid' }) blockedUserId!: string;
  @ApiProperty({ enum: UserBlockStatus }) status!: UserBlockStatus;
  @ApiProperty() blockedAt!: Date;
  @ApiPropertyOptional({ nullable: true }) unblockedAt!: Date | null;

  static from(block: UserBlock): UserBlockDto {
    return {
      id: block.id,
      blockedUserId: block.blockedUserId,
      status: block.status,
      blockedAt: block.blockedAt,
      unblockedAt: block.unblockedAt,
    };
  }
}

export class ReportEvidenceViewDto {
  @ApiProperty({ enum: EvidenceKind }) kind!: EvidenceKind;
  @ApiProperty({ format: 'uuid' }) referenceId!: string;
  @ApiPropertyOptional({ nullable: true }) sha256!: string | null;
  @ApiPropertyOptional({ enum: EvidenceContentType, nullable: true }) contentType!: EvidenceContentType | null;
  @ApiPropertyOptional({ nullable: true }) byteSize!: number | null;
  @ApiProperty({
    enum: EvidenceVerificationStatus,
    description: 'Foundation chỉ nhận metadata claim; chưa được coi là evidence đã xác minh',
  })
  verificationStatus!: EvidenceVerificationStatus;
}

export class SafetyReportDto {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty({ format: 'uuid' }) reportedUserId!: string;
  @ApiProperty({ enum: ReportCategory }) category!: ReportCategory;
  @ApiProperty({ enum: ReportPriority }) priority!: ReportPriority;
  @ApiProperty({ enum: ReportStatus }) status!: ReportStatus;
  @ApiPropertyOptional({ nullable: true }) summary!: string | null;
  @ApiProperty({ type: [ReportEvidenceViewDto] }) evidence!: ReportEvidenceViewDto[];
  @ApiProperty() createdAt!: Date;
}
