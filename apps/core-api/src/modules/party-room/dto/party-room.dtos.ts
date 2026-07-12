import { ApiProperty } from '@nestjs/swagger';
import { IsIn, IsNotEmpty, IsString, MaxLength } from 'class-validator';

import {
  PartyRoom,
  PartyRoomCloseReason,
  PartyRoomStatus,
} from '../entities/party-room.entity';
import {
  PartyRole,
  PartyRoomMember,
} from '../entities/party-room-member.entity';

import type { CursorPageMeta } from '@litmatch/common-dtos';

export class CreatePartyRoomDto {
  // sanity cap transport — giới hạn nghiệp vụ thật lấy từ PARTY_TITLE_MAX_LENGTH trong service
  @ApiProperty({ maxLength: 500 })
  @IsString()
  @IsNotEmpty()
  @MaxLength(500)
  title!: string;
}

export class ChangePartyRoleDto {
  @ApiProperty({ enum: [PartyRole.Speaker, PartyRole.Audience] })
  @IsIn([PartyRole.Speaker, PartyRole.Audience])
  role!: PartyRole.Speaker | PartyRole.Audience;
}

export class PartyRoomMemberDto {
  @ApiProperty() userId!: string;
  @ApiProperty({ enum: PartyRole }) role!: PartyRole;
  @ApiProperty() joinedAt!: Date;

  static from(member: PartyRoomMember): PartyRoomMemberDto {
    const dto = new PartyRoomMemberDto();
    dto.userId = member.userId;
    dto.role = member.role;
    dto.joinedAt = member.joinedAt;
    return dto;
  }
}

export class PartyRoomDto {
  @ApiProperty() id!: string;
  @ApiProperty() hostUserId!: string;
  @ApiProperty() title!: string;
  @ApiProperty({ enum: PartyRoomStatus }) status!: PartyRoomStatus;
  @ApiProperty() speakerLimit!: number;
  @ApiProperty({ enum: PartyRoomCloseReason, nullable: true })
  closeReason!: PartyRoomCloseReason | null;
  @ApiProperty() createdAt!: Date;

  static from(room: PartyRoom): PartyRoomDto {
    const dto = new PartyRoomDto();
    dto.id = room.id;
    dto.hostUserId = room.hostUserId;
    dto.title = room.title;
    dto.status = room.status;
    dto.speakerLimit = room.speakerLimit;
    dto.closeReason = room.closeReason;
    dto.createdAt = room.createdAt;
    return dto;
  }
}

export class PartyRoomDetailDto {
  @ApiProperty() room!: PartyRoomDto;
  @ApiProperty({ type: [PartyRoomMemberDto] }) members!: PartyRoomMemberDto[];

  static from(room: PartyRoom, members: PartyRoomMember[]): PartyRoomDetailDto {
    const dto = new PartyRoomDetailDto();
    dto.room = PartyRoomDto.from(room);
    dto.members = members.map(PartyRoomMemberDto.from);
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
  @ApiProperty() meta!: CursorPageMeta;

  static from(rooms: PartyRoom[], meta: CursorPageMeta): PartyRoomListDto {
    const dto = new PartyRoomListDto();
    dto.data = rooms.map(PartyRoomDto.from);
    dto.meta = meta;
    return dto;
  }
}
