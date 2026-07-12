import { ApiProperty } from '@nestjs/swagger';

import {
  CallEndReason,
  CallSession,
  CallSessionStatus,
} from '../entities/call-session.entity';

export class CallDto {
  @ApiProperty() id!: string;
  @ApiProperty() matchSessionId!: string;
  @ApiProperty({ enum: CallSessionStatus }) status!: CallSessionStatus;
  @ApiProperty({ nullable: true, type: Date }) startedAt!: Date | null;
  @ApiProperty({ nullable: true, type: Date }) endedAt!: Date | null;
  @ApiProperty({ enum: CallEndReason, nullable: true })
  endReason!: CallEndReason | null;
  @ApiProperty({ nullable: true, type: Number })
  durationSeconds!: number | null;
  @ApiProperty() billedMinutes!: number;

  static from(call: CallSession): CallDto {
    const dto = new CallDto();
    dto.id = call.id;
    dto.matchSessionId = call.matchSessionId;
    dto.status = call.status;
    dto.startedAt = call.startedAt;
    dto.endedAt = call.endedAt;
    dto.endReason = call.endReason;
    dto.durationSeconds = call.durationSeconds;
    dto.billedMinutes = call.billedMinutes;
    return dto;
  }
}

/** Đủ để client nối LiveKit — roomName/identity server đặt, không nhận từ client (spec § 2). */
export class JoinCallDto {
  @ApiProperty() call!: CallDto;
  @ApiProperty() token!: string;
  @ApiProperty() livekitUrl!: string;

  static from(
    call: CallSession,
    token: string,
    livekitUrl: string,
  ): JoinCallDto {
    const dto = new JoinCallDto();
    dto.call = CallDto.from(call);
    dto.token = token;
    dto.livekitUrl = livekitUrl;
    return dto;
  }
}
