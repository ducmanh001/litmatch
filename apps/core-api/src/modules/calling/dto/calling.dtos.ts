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
  /** Server derive từ CALLING_FREE_CALL_SECONDS; client chỉ hiển thị countdown, không tự enforce. */
  @ApiProperty({ nullable: true, type: Date }) freeCallEndsAt!: Date | null;

  static from(call: CallSession, freeCallSeconds: number): CallDto {
    const dto = new CallDto();
    dto.id = call.id;
    dto.matchSessionId = call.matchSessionId;
    dto.status = call.status;
    dto.startedAt = call.startedAt;
    dto.endedAt = call.endedAt;
    dto.endReason = call.endReason;
    dto.durationSeconds = call.durationSeconds;
    dto.billedMinutes = call.billedMinutes;
    dto.freeCallEndsAt = call.startedAt
      ? new Date(call.startedAt.getTime() + freeCallSeconds * 1000)
      : null;
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
    freeCallSeconds: number,
  ): JoinCallDto {
    const dto = new JoinCallDto();
    dto.call = CallDto.from(call, freeCallSeconds);
    dto.token = token;
    dto.livekitUrl = livekitUrl;
    return dto;
  }
}

export class VoiceMatchLikeDto {
  @ApiProperty() liked!: boolean;
  /** true khi cả hai đã thích và Friendship + Conversation đã được tạo atomically. */
  @ApiProperty() matched!: boolean;
  /** Chỉ trả khi mutual like để client mở chat 1-1; null trước khi đủ consent hai chiều. */
  @ApiProperty({ type: String, nullable: true }) friendUserId!: string | null;
}
