import { ApiProperty } from '@nestjs/swagger';
import { IsEnum } from 'class-validator';

import {
  MatchTicket,
  MatchTicketStatus,
  MatchType,
} from '../entities/match-ticket.entity';

/**
 * Client CHỈ được chọn matchType. region + ageBand server tự derive từ profile user
 * (User.region / User.birthDate) — KHÔNG nhận từ body/header: client tự khai region/tuổi
 * là dữ liệu nghiệp vụ quyết định shard ghép cặp, tin client là lỗi docs/10 § 10.0.B
 * (client giả mạo để chọn shard/độ tuổi mình muốn).
 */
export class JoinQueueDto {
  @ApiProperty({ enum: MatchType, example: MatchType.Voice })
  @IsEnum(MatchType)
  matchType!: MatchType;
}

export class TicketDto {
  @ApiProperty() id!: string;
  @ApiProperty({ enum: MatchType }) matchType!: MatchType;
  @ApiProperty({ enum: MatchTicketStatus }) status!: MatchTicketStatus;
  @ApiProperty({ description: 'Shard region server derive từ profile' })
  region!: string;
  @ApiProperty({
    description:
      'Dải tuổi server derive từ birthDate; -1 = chưa khai sinh nhật',
  })
  ageBand!: number;
  @ApiProperty({ nullable: true, type: String }) sessionId!: string | null;
  @ApiProperty() enqueuedAt!: Date;
  @ApiProperty() createdAt!: Date;

  static from(ticket: MatchTicket): TicketDto {
    const dto = new TicketDto();
    dto.id = ticket.id;
    dto.matchType = ticket.matchType;
    dto.status = ticket.status;
    dto.region = ticket.region;
    dto.ageBand = ticket.ageBand;
    dto.sessionId = ticket.sessionId;
    dto.enqueuedAt = ticket.enqueuedAt;
    dto.createdAt = ticket.createdAt;
    return dto;
  }
}

export class SpeedupResultDto {
  @ApiProperty({
    description: 'Transaction id của giao dịch trừ diamond (ledger)',
  })
  transactionId!: string;
  @ApiProperty({
    description: 'true = retry cùng Idempotency-Key, không trừ tiền/boost thêm',
  })
  replayed!: boolean;
  @ApiProperty({ type: TicketDto }) ticket!: TicketDto;

  static from(
    transactionId: string,
    replayed: boolean,
    ticket: MatchTicket,
  ): SpeedupResultDto {
    const dto = new SpeedupResultDto();
    dto.transactionId = transactionId;
    dto.replayed = replayed;
    dto.ticket = TicketDto.from(ticket);
    return dto;
  }
}
