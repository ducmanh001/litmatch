import { ApiProperty } from '@nestjs/swagger';
import { IsString, Length } from 'class-validator';

import { ApiCursorPageMeta } from '../../../common/decorators/cursor-page-query.decorator';
import { MESSAGE_CONTENT_HARD_CAP } from '../friend.constants';
import { PublicProfileDto } from '../../user';

import type { CursorPageMeta } from '@litmatch/common-dtos';
import type { FriendListEntry } from '../friend.service';
import type { Message } from '../entities/message.entity';

export class SendFriendMessageDto {
  @ApiProperty({ maxLength: MESSAGE_CONTENT_HARD_CAP })
  @IsString()
  // Sanity cap transport — giới hạn nghiệp vụ thật là config FRIEND_MESSAGE_MAX_LENGTH (service check)
  @Length(1, MESSAGE_CONTENT_HARD_CAP)
  content!: string;
}

export class MessageDto {
  @ApiProperty() id!: string;
  @ApiProperty() conversationId!: string;
  @ApiProperty() senderUserId!: string;
  @ApiProperty() content!: string;
  @ApiProperty() sentAt!: Date;

  static from(message: Message): MessageDto {
    const dto = new MessageDto();
    dto.id = message.id;
    dto.conversationId = message.conversationId;
    dto.senderUserId = message.senderUserId;
    dto.content = message.content;
    dto.sentAt = message.createdAt;
    return dto;
  }
}

export class MessagesPageDto {
  @ApiProperty({ type: [MessageDto] }) items!: MessageDto[];
  @ApiCursorPageMeta() meta!: CursorPageMeta;
}

export class ConversationDto {
  @ApiProperty() id!: string;

  static from(id: string): ConversationDto {
    const dto = new ConversationDto();
    dto.id = id;
    return dto;
  }
}

export class FriendDto {
  @ApiProperty() profile!: PublicProfileDto;
  @ApiProperty() conversationId!: string;
  @ApiProperty() friendSince!: Date;
  @ApiProperty({ nullable: true, type: Date }) lastMessageAt!: Date | null;

  static from(entry: FriendListEntry, profile: PublicProfileDto): FriendDto {
    const dto = new FriendDto();
    dto.profile = profile;
    dto.conversationId = entry.conversationId;
    dto.friendSince = entry.friendSince;
    dto.lastMessageAt = entry.lastMessageAt;
    return dto;
  }
}
