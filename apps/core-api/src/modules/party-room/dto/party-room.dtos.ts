import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsEnum,
  IsIn,
  IsNotEmpty,
  IsOptional,
  IsString,
  Length,
  MaxLength,
} from 'class-validator';
import { CursorPageQueryDto } from '@litmatch/common-dtos';

import { ApiCursorPageMeta } from '../../../common/decorators/cursor-page-query.decorator';
import { PARTY_COMMENT_CONTENT_HARD_CAP } from '../party-room.constants';
import {
  PartyRoom,
  PartyRoomCategory,
  PartyRoomCloseReason,
  PartyRoomStatus,
} from '../entities/party-room.entity';
import {
  PartyRole,
  PartyRoomMember,
} from '../entities/party-room-member.entity';
import { PartyRoomComment } from '../entities/party-room-comment.entity';

import type { CursorPageMeta } from '@litmatch/common-dtos';
import type { PartyRoomSummary } from '../party-room.service';

export class CreatePartyRoomDto {
  // sanity cap transport — giới hạn nghiệp vụ thật lấy từ PARTY_TITLE_MAX_LENGTH trong service
  @ApiProperty({ maxLength: 500 })
  @IsString()
  @IsNotEmpty()
  @MaxLength(500)
  title!: string;

  @ApiPropertyOptional({
    enum: PartyRoomCategory,
    default: PartyRoomCategory.Talk,
  })
  @IsOptional()
  @IsEnum(PartyRoomCategory)
  category?: PartyRoomCategory;
}

export class ListPartyRoomsQueryDto extends CursorPageQueryDto {
  @ApiPropertyOptional({ maxLength: 100, description: 'Tìm theo tên phòng' })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  q?: string;

  @ApiPropertyOptional({ enum: PartyRoomCategory })
  @IsOptional()
  @IsEnum(PartyRoomCategory)
  category?: PartyRoomCategory;
}

export class ChangePartyRoleDto {
  @ApiProperty({ enum: [PartyRole.Audience] })
  @IsIn([PartyRole.Audience])
  role!: PartyRole.Audience;
}

export class PartyRoomMemberDto {
  @ApiProperty() userId!: string;
  @ApiProperty({ enum: PartyRole }) role!: PartyRole;
  @ApiProperty() joinedAt!: Date;
  @ApiProperty({ type: String, format: 'date-time', nullable: true })
  disconnectedAt!: Date | null;
  @ApiPropertyOptional() nickname?: string;
  /** Chỉ true cho chính viewer đang có lời mời; không leak lời mời của người khác. */
  @ApiProperty() speakerInvitePending!: boolean;

  static from(
    member: PartyRoomMember,
    viewerUserId?: string,
    hostUserId?: string,
    nicknameById?: ReadonlyMap<string, string>,
  ): PartyRoomMemberDto {
    const dto = new PartyRoomMemberDto();
    dto.userId = member.userId;
    dto.role = member.role;
    dto.joinedAt = member.joinedAt;
    dto.disconnectedAt = member.disconnectedAt;
    dto.nickname = nicknameById?.get(member.userId);
    dto.speakerInvitePending =
      member.speakerInvitePending &&
      (member.userId === viewerUserId || viewerUserId === hostUserId);
    return dto;
  }
}

export class ListPartyRoomCommentsQueryDto extends CursorPageQueryDto {}

export class CreatePartyRoomCommentDto {
  @ApiProperty({ maxLength: PARTY_COMMENT_CONTENT_HARD_CAP })
  @IsString()
  @Length(1, PARTY_COMMENT_CONTENT_HARD_CAP)
  content!: string;
}

export class PartyRoomCommentDto {
  @ApiProperty() id!: string;
  @ApiProperty() roomId!: string;
  @ApiProperty() senderUserId!: string;
  @ApiProperty() content!: string;
  @ApiProperty() sentAt!: Date;

  static from(comment: PartyRoomComment): PartyRoomCommentDto {
    const dto = new PartyRoomCommentDto();
    dto.id = comment.id;
    dto.roomId = comment.roomId;
    dto.senderUserId = comment.senderUserId;
    dto.content = comment.content;
    dto.sentAt = comment.createdAt;
    return dto;
  }
}

export class PartyRoomCommentsPageDto {
  @ApiProperty({ type: [PartyRoomCommentDto] }) items!: PartyRoomCommentDto[];
  @ApiCursorPageMeta() meta!: CursorPageMeta;

  static from(page: {
    items: PartyRoomComment[];
    meta: CursorPageMeta;
  }): PartyRoomCommentsPageDto {
    const dto = new PartyRoomCommentsPageDto();
    dto.items = page.items.map((comment) => PartyRoomCommentDto.from(comment));
    dto.meta = page.meta;
    return dto;
  }
}

export class PartyRoomDto {
  @ApiProperty() id!: string;
  @ApiProperty() hostUserId!: string;
  @ApiProperty() title!: string;
  @ApiProperty({ enum: PartyRoomStatus }) status!: PartyRoomStatus;
  @ApiProperty() speakerLimit!: number;
  @ApiProperty({ enum: PartyRoomCategory }) category!: PartyRoomCategory;
  @ApiPropertyOptional({
    description: 'Số member active; có trong list/detail',
  })
  memberCount?: number;
  @ApiProperty({ enum: PartyRoomCloseReason, nullable: true })
  closeReason!: PartyRoomCloseReason | null;
  @ApiProperty() createdAt!: Date;
  /** Host đang trong grace chờ tự kết nối lại (party-room-service.md § 4) — null = bình thường. */
  @ApiProperty({ type: String, format: 'date-time', nullable: true })
  hostDisconnectedAt!: Date | null;

  static from(room: PartyRoom, memberCount?: number): PartyRoomDto {
    const dto = new PartyRoomDto();
    dto.id = room.id;
    dto.hostUserId = room.hostUserId;
    dto.title = room.title;
    dto.status = room.status;
    dto.speakerLimit = room.speakerLimit;
    dto.category = room.category;
    dto.memberCount = memberCount;
    dto.closeReason = room.closeReason;
    dto.createdAt = room.createdAt;
    dto.hostDisconnectedAt = room.hostDisconnectedAt;
    return dto;
  }
}

export class PartyRoomDetailDto {
  @ApiProperty() room!: PartyRoomDto;
  @ApiProperty({ type: [PartyRoomMemberDto] }) members!: PartyRoomMemberDto[];

  static from(
    room: PartyRoom,
    members: PartyRoomMember[],
    viewerUserId?: string,
    nicknameById?: ReadonlyMap<string, string>,
  ): PartyRoomDetailDto {
    const dto = new PartyRoomDetailDto();
    dto.room = PartyRoomDto.from(room, members.length);
    dto.members = members.map((member) =>
      PartyRoomMemberDto.from(
        member,
        viewerUserId,
        room.hostUserId,
        nicknameById,
      ),
    );
    return dto;
  }
}

/** Đủ để client nối LiveKit — roomName/identity server đặt, không nhận từ client. */
export class JoinPartyRoomDto {
  @ApiProperty() room!: PartyRoomDto;
  @ApiProperty() membership!: PartyRoomMemberDto;
  @ApiProperty() token!: string;
  @ApiProperty() livekitUrl!: string;

  static from(
    room: PartyRoom,
    membership: PartyRoomMember,
    token: string,
    livekitUrl: string,
  ): JoinPartyRoomDto {
    const dto = new JoinPartyRoomDto();
    dto.room = PartyRoomDto.from(room);
    dto.membership = PartyRoomMemberDto.from(membership);
    dto.token = token;
    dto.livekitUrl = livekitUrl;
    return dto;
  }
}

export class PartyRoomListDto {
  @ApiProperty({ type: [PartyRoomDto] }) data!: PartyRoomDto[];
  @ApiCursorPageMeta() meta!: CursorPageMeta;

  static from(
    rooms: PartyRoomSummary[],
    meta: CursorPageMeta,
  ): PartyRoomListDto {
    const dto = new PartyRoomListDto();
    dto.data = rooms.map((summary) =>
      PartyRoomDto.from(summary.room, summary.memberCount),
    );
    dto.meta = meta;
    return dto;
  }
}
