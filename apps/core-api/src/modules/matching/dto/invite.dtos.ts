import { ApiProperty } from '@nestjs/swagger';
import { IsEnum, IsUUID } from 'class-validator';

import {
  MatchInvite,
  MatchInviteStatus,
} from '../entities/match-invite.entity';
import { MatchType } from '../entities/match-ticket.entity';

/**
 * CTA "mời Voice/Soul Match" (W4) — directed invite, KHÔNG phải friend-request. Server tự
 * derive region/ageBand của cả 2 bên lúc accept (giống `JoinQueueDto`) — client chỉ chọn ai và
 * loại match nào.
 */
export class CreateInviteDto {
  @ApiProperty({ description: 'userId người được mời' })
  @IsUUID()
  inviteeUserId!: string;

  @ApiProperty({ enum: MatchType, example: MatchType.Voice })
  @IsEnum(MatchType)
  matchType!: MatchType;
}

export class MatchInviteDto {
  @ApiProperty() id!: string;
  @ApiProperty() inviterUserId!: string;
  @ApiProperty() inviteeUserId!: string;
  @ApiProperty({ enum: MatchType }) matchType!: MatchType;
  @ApiProperty({ enum: MatchInviteStatus }) status!: MatchInviteStatus;
  @ApiProperty() expiresAt!: Date;
  @ApiProperty({ nullable: true, type: String }) sessionId!: string | null;
  @ApiProperty() createdAt!: Date;

  static from(invite: MatchInvite): MatchInviteDto {
    const dto = new MatchInviteDto();
    dto.id = invite.id;
    dto.inviterUserId = invite.inviterUserId;
    dto.inviteeUserId = invite.inviteeUserId;
    dto.matchType = invite.matchType;
    dto.status = invite.status;
    dto.expiresAt = invite.expiresAt;
    dto.sessionId = invite.sessionId;
    dto.createdAt = invite.createdAt;
    return dto;
  }
}

export class MatchInvitesPageDto {
  @ApiProperty({ type: [MatchInviteDto] }) items!: MatchInviteDto[];
  @ApiProperty({ nullable: true, type: String }) nextCursor!: string | null;

  static from(page: {
    items: MatchInvite[];
    meta: { nextCursor: string | null };
  }): MatchInvitesPageDto {
    const dto = new MatchInvitesPageDto();
    dto.items = page.items.map((i) => MatchInviteDto.from(i));
    dto.nextCursor = page.meta.nextCursor;
    return dto;
  }
}

export class MatchInviteAcceptedDto {
  @ApiProperty({ type: MatchInviteDto }) invite!: MatchInviteDto;
  @ApiProperty({
    description: 'sessionId — cùng khái niệm session của auto-match',
  })
  sessionId!: string;
  @ApiProperty({
    description:
      'ticketId CỦA CHÍNH NGƯỜI ACCEPT — gọi confirmTicket(ticketId) như auto-match',
  })
  inviteeTicketId!: string;

  static from(result: {
    invite: MatchInvite;
    session: { id: string };
    inviteeTicketId: string;
  }): MatchInviteAcceptedDto {
    const dto = new MatchInviteAcceptedDto();
    dto.invite = MatchInviteDto.from(result.invite);
    dto.sessionId = result.session.id;
    dto.inviteeTicketId = result.inviteeTicketId;
    return dto;
  }
}
