import { ApiProperty } from '@nestjs/swagger';
import { IsEnum, IsOptional } from 'class-validator';

import {
  GenderPreference,
  MatchTicket,
  MatchTicketStatus,
  MatchType,
} from '../entities/match-ticket.entity';

/**
 * Client CHỈ được chọn matchType + genderPreference (2 lựa chọn hợp lệ của user, không phải
 * dữ liệu derive). region + ageBand server tự derive từ profile user (User.region /
 * User.birthDate) — KHÔNG nhận từ body/header: client tự khai region/tuổi là dữ liệu nghiệp vụ
 * quyết định shard ghép cặp, tin client là lỗi docs/10 § 10.0.B (client giả mạo để chọn
 * shard/độ tuổi mình muốn).
 */
export class JoinQueueDto {
  @ApiProperty({ enum: MatchType, example: MatchType.Voice })
  @IsEnum(MatchType)
  matchType!: MatchType;

  @ApiProperty({
    enum: GenderPreference,
    required: false,
    default: GenderPreference.Any,
    description:
      'Giới tính muốn ghép (docs/01 #13) — bỏ trống = any. Check khớp 2 CHIỀU lúc ghép.',
  })
  @IsOptional()
  @IsEnum(GenderPreference)
  genderPreference?: GenderPreference;
}

export class TicketDto {
  @ApiProperty() id!: string;
  @ApiProperty({ enum: MatchType }) matchType!: MatchType;
  @ApiProperty({ enum: MatchTicketStatus }) status!: MatchTicketStatus;
  @ApiProperty({
    minimum: 1,
    description:
      'Giá 1 lần speed-up do server cấu hình; client phải hiển thị giá này, không hard-code.',
  })
  speedupPriceDiamond!: number;
  @ApiProperty({ description: 'Shard region server derive từ profile' })
  region!: string;
  @ApiProperty({
    description:
      'Dải tuổi server derive từ birthDate; -1 = chưa khai sinh nhật',
  })
  ageBand!: number;
  @ApiProperty({ enum: GenderPreference })
  genderPreference!: GenderPreference;
  @ApiProperty({ nullable: true, type: String }) sessionId!: string | null;
  @ApiProperty() enqueuedAt!: Date;
  @ApiProperty() createdAt!: Date;

  static from(ticket: MatchTicket, speedupPriceDiamond: number): TicketDto {
    const dto = new TicketDto();
    dto.id = ticket.id;
    dto.matchType = ticket.matchType;
    dto.status = ticket.status;
    dto.speedupPriceDiamond = speedupPriceDiamond;
    dto.region = ticket.region;
    dto.ageBand = ticket.ageBand;
    dto.genderPreference = ticket.genderPreference;
    dto.sessionId = ticket.sessionId;
    dto.enqueuedAt = ticket.enqueuedAt;
    dto.createdAt = ticket.createdAt;
    return dto;
  }
}

/**
 * Wrapper ổn định cho reload/reconnect: field `ticket` luôn có trong JSON, chỉ giá trị bên trong
 * nullable khi user không có ticket `queued|matched`. Tránh raw-null response khó biểu diễn đúng
 * trong OpenAPI client.
 */
export class ActiveTicketResponseDto {
  @ApiProperty({ type: TicketDto, nullable: true })
  ticket!: TicketDto | null;

  static from(
    ticket: MatchTicket | null,
    speedupPriceDiamond: number,
  ): ActiveTicketResponseDto {
    const dto = new ActiveTicketResponseDto();
    dto.ticket = ticket ? TicketDto.from(ticket, speedupPriceDiamond) : null;
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
    speedupPriceDiamond: number,
  ): SpeedupResultDto {
    const dto = new SpeedupResultDto();
    dto.transactionId = transactionId;
    dto.replayed = replayed;
    dto.ticket = TicketDto.from(ticket, speedupPriceDiamond);
    return dto;
  }
}
