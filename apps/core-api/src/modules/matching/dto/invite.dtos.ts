import { ApiProperty } from '@nestjs/swagger';
import { IsEnum, IsUUID } from 'class-validator';

import {
  MatchInvite,
  MatchInviteStatus,
} from '../entities/match-invite.entity';
import { MatchType } from '../entities/match-ticket.entity';
import { PublicProfileDto } from '../../user';

import type { User } from '../../user';

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
  @ApiProperty({
    type: PublicProfileDto,
    description:
      'Profile công khai tối thiểu của người mời để người nhận quyết định có chủ đích.',
  })
  inviterProfile!: PublicProfileDto;

  static from(invite: MatchInvite, inviter: User): MatchInviteDto {
    const dto = new MatchInviteDto();
    dto.id = invite.id;
    dto.inviterUserId = invite.inviterUserId;
    dto.inviteeUserId = invite.inviteeUserId;
    dto.matchType = invite.matchType;
    dto.status = invite.status;
    dto.expiresAt = invite.expiresAt;
    dto.sessionId = invite.sessionId;
    dto.createdAt = invite.createdAt;
    dto.inviterProfile = PublicProfileDto.from(inviter);
    return dto;
  }
}

export class MatchInvitesPageDto {
  @ApiProperty({ type: [MatchInviteDto] }) items!: MatchInviteDto[];
  @ApiProperty({ nullable: true, type: String }) nextCursor!: string | null;

  static from(
    page: {
      items: MatchInvite[];
      meta: { nextCursor: string | null };
    },
    invitersById: ReadonlyMap<string, User>,
  ): MatchInvitesPageDto {
    const dto = new MatchInvitesPageDto();
    dto.items = page.items.map((invite) => {
      const inviter = invitersById.get(invite.inviterUserId);
      if (!inviter) {
        throw new Error(
          `Thiếu public profile cho inviter ${invite.inviterUserId} của invite ${invite.id}`,
        );
      }
      return MatchInviteDto.from(invite, inviter);
    });
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

  static from(
    result: {
      invite: MatchInvite;
      session: { id: string };
      inviteeTicketId: string;
    },
    inviter: User,
  ): MatchInviteAcceptedDto {
    const dto = new MatchInviteAcceptedDto();
    dto.invite = MatchInviteDto.from(result.invite, inviter);
    dto.sessionId = result.session.id;
    dto.inviteeTicketId = result.inviteeTicketId;
    return dto;
  }
}
