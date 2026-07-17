import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { CursorPageQueryDto } from '@litmatch/common-dtos';
import {
  IsEnum,
  IsOptional,
  IsString,
  Length,
  MaxLength,
} from 'class-validator';

import {
  SupportTicket,
  SupportTicketCategory,
  SupportTicketStatus,
} from '../entities/support-ticket.entity';
import { ApiCursorPageMeta } from '../../../common/decorators/cursor-page-query.decorator';

import type { CursorPageMeta } from '@litmatch/common-dtos';

export class CreateSupportTicketDto {
  @ApiProperty({ enum: SupportTicketCategory })
  @IsEnum(SupportTicketCategory)
  category!: SupportTicketCategory;

  @ApiProperty({ minLength: 5, maxLength: 2000 })
  @IsString()
  @Length(5, 2000)
  message!: string;
}

export class SupportTicketDto {
  @ApiProperty() id!: string;
  @ApiProperty() userId!: string;
  @ApiProperty({ enum: SupportTicketCategory })
  category!: SupportTicketCategory;
  @ApiProperty() message!: string;
  @ApiProperty({ enum: SupportTicketStatus }) status!: SupportTicketStatus;
  @ApiPropertyOptional({ nullable: true, type: String })
  staffResponse!: string | null;
  @ApiProperty() createdAt!: Date;
  @ApiProperty() updatedAt!: Date;

  static from(ticket: SupportTicket): SupportTicketDto {
    return {
      id: ticket.id,
      userId: ticket.userId,
      category: ticket.category,
      message: ticket.message,
      status: ticket.status,
      staffResponse: ticket.staffResponse,
      createdAt: ticket.createdAt,
      updatedAt: ticket.updatedAt,
    };
  }
}

export class SupportTicketsPageDto {
  @ApiProperty({ type: [SupportTicketDto] }) items!: SupportTicketDto[];
  @ApiCursorPageMeta() meta!: CursorPageMeta;
}

export class ListSupportTicketsQueryDto extends CursorPageQueryDto {
  @ApiPropertyOptional({ enum: SupportTicketStatus })
  @IsOptional()
  @IsEnum(SupportTicketStatus)
  status?: SupportTicketStatus;
}

export class UpdateSupportTicketDto {
  @ApiProperty({ enum: SupportTicketStatus })
  @IsEnum(SupportTicketStatus)
  status!: SupportTicketStatus;

  @ApiPropertyOptional({ maxLength: 2000 })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  staffResponse?: string;
}
