import { ApiProperty } from '@nestjs/swagger';
import {
  PartyRoomCategory,
  PartyRoomCloseReason,
  PartyRoomStatus,
} from '../../party-room';

import type { CursorPageMeta } from '@litmatch/common-dtos';
import type { PartyRoom, PartyRoomSummary } from '../../party-room';

export class AdminRoomDto {
  @ApiProperty() id!: string;
  @ApiProperty() hostUserId!: string;
  @ApiProperty() title!: string;
  @ApiProperty({ enum: PartyRoomStatus }) status!: PartyRoomStatus;
  @ApiProperty() speakerLimit!: number;
  @ApiProperty({ enum: PartyRoomCategory }) category!: PartyRoomCategory;
  @ApiProperty() memberCount!: number;
  @ApiProperty({ enum: PartyRoomCloseReason, nullable: true })
  closeReason!: PartyRoomCloseReason | null;
  @ApiProperty() createdAt!: Date;
  @ApiProperty({ type: String, format: 'date-time', nullable: true })
  hostDisconnectedAt!: Date | null;

  static from(summary: PartyRoomSummary): AdminRoomDto {
    const dto = new AdminRoomDto();
    const room: PartyRoom = summary.room;
    dto.id = room.id;
    dto.hostUserId = room.hostUserId;
    dto.title = room.title;
    dto.status = room.status;
    dto.speakerLimit = room.speakerLimit;
    dto.category = room.category;
    dto.memberCount = summary.memberCount;
    dto.closeReason = room.closeReason;
    dto.createdAt = room.createdAt;
    dto.hostDisconnectedAt = room.hostDisconnectedAt;
    return dto;
  }
}

export class AdminRoomsPageDto {
  @ApiProperty({ type: [AdminRoomDto] }) data!: AdminRoomDto[];
  @ApiProperty({
    type: 'object',
    properties: { nextCursor: { type: 'string', nullable: true } },
  })
  meta!: CursorPageMeta;

  static from(page: {
    data: PartyRoomSummary[];
    meta: CursorPageMeta;
  }): AdminRoomsPageDto {
    const dto = new AdminRoomsPageDto();
    dto.data = page.data.map(AdminRoomDto.from);
    dto.meta = page.meta;
    return dto;
  }
}

export class AdminCloseRoomResultDto {
  @ApiProperty({ description: 'false khi phòng đã đóng trước đó (idempotent)' })
  closed!: boolean;
}
