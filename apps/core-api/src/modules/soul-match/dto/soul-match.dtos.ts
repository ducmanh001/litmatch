import { ApiProperty } from '@nestjs/swagger';
import { IsEnum, IsString, Length } from 'class-validator';

import { ApiCursorPageMeta } from '../../../common/decorators/cursor-page-query.decorator';
import { MESSAGE_CONTENT_HARD_CAP } from '../soul-match.constants';
import { SoulMatchVerdict } from '../entities/soul-match-rating.entity';
import { SoulRoomPhase } from '../soul-match.types';

import type { CursorPageMeta } from '@litmatch/common-dtos';
import type { SoulChatMessage } from '../entities/soul-chat-message.entity';
import type { SoulRoomView } from '../soul-match.types';

/** Vai người gửi TƯƠNG ĐỐI với người xem — không bao giờ lộ userId đối phương (spec § 2). */
export enum SoulSenderRole {
  Me = 'me',
  Partner = 'partner',
}

export class SendSoulMessageDto {
  @ApiProperty({ maxLength: MESSAGE_CONTENT_HARD_CAP })
  @IsString()
  // Sanity cap transport — giới hạn nghiệp vụ thật là config SOUL_CHAT_MESSAGE_MAX_LENGTH (service check)
  @Length(1, MESSAGE_CONTENT_HARD_CAP)
  content!: string;
}

export class RateSessionDto {
  @ApiProperty({ enum: SoulMatchVerdict })
  @IsEnum(SoulMatchVerdict)
  verdict!: SoulMatchVerdict;
}

export class SoulMessageDto {
  @ApiProperty() id!: string;
  @ApiProperty({ enum: SoulSenderRole }) senderRole!: SoulSenderRole;
  @ApiProperty() content!: string;
  @ApiProperty() sentAt!: Date;

  static from(message: SoulChatMessage, viewerUserId: string): SoulMessageDto {
    const dto = new SoulMessageDto();
    dto.id = message.id;
    dto.senderRole =
      message.senderUserId === viewerUserId
        ? SoulSenderRole.Me
        : SoulSenderRole.Partner;
    dto.content = message.content;
    dto.sentAt = message.createdAt;
    return dto;
  }
}

export class SoulMessagesPageDto {
  @ApiProperty({ type: [SoulMessageDto] }) items!: SoulMessageDto[];
  @ApiCursorPageMeta() meta!: CursorPageMeta;
}

/**
 * Trạng thái phòng cho member poll — CHỈ verdict của chính mình + cờ matched;
 * verdict đối phương không bao giờ leak (docs/10 § Soul Match).
 */
export class SoulSessionViewDto {
  @ApiProperty() sessionId!: string;
  @ApiProperty({ enum: SoulRoomPhase }) phase!: SoulRoomPhase;
  @ApiProperty() chatEndsAt!: Date;
  @ApiProperty() ratingEndsAt!: Date;
  @ApiProperty({ enum: SoulMatchVerdict, nullable: true })
  myVerdict!: SoulMatchVerdict | null;
  @ApiProperty() matched!: boolean;

  static from(
    room: SoulRoomView,
    myVerdict: SoulMatchVerdict | null,
    matched: boolean,
  ): SoulSessionViewDto {
    const dto = new SoulSessionViewDto();
    dto.sessionId = room.session.id;
    dto.phase = room.phase;
    dto.chatEndsAt = room.chatEndsAt;
    dto.ratingEndsAt = room.ratingEndsAt;
    dto.myVerdict = myVerdict;
    dto.matched = matched;
    return dto;
  }
}

export class RatingResultDto {
  @ApiProperty({ enum: SoulMatchVerdict }) verdict!: SoulMatchVerdict;
  /** true = Friendship đã tồn tại (unlock profile) — gồm cả trường hợp đã là bạn từ session trước. */
  @ApiProperty() matched!: boolean;

  static from(verdict: SoulMatchVerdict, matched: boolean): RatingResultDto {
    const dto = new RatingResultDto();
    dto.verdict = verdict;
    dto.matched = matched;
    return dto;
  }
}
