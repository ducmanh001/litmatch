import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsBoolean,
  IsEnum,
  IsIn,
  IsNotEmpty,
  IsNumber,
  IsString,
  IsUUID,
  Length,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

import { ApiCursorPageMeta } from '../../../common/decorators/cursor-page-query.decorator';
import {
  MOVIE_MATCH_REACTIONS,
  MOVIE_MESSAGE_HARD_CAP,
  VIDEO_URL_HARD_CAP,
} from '../movie-match.constants';
import {
  MovieMatchOutcome,
  MovieMatchRating,
} from '../entities/movie-session.entity';
import {
  MovieMatchClientState,
  type MovieMatchAnonStateView,
} from '../movie-match.service';

import type { CursorPageMeta } from '@litmatch/common-dtos';
import type { MovieSessionMessage } from '../entities/movie-match-anon.entities';
import type { MovieSession } from '../entities/movie-session.entity';

export class CreateMovieSessionDto {
  @ApiProperty({
    description: 'userId của bạn muốn xem chung — phải đã là bạn',
  })
  @IsUUID()
  friendUserId!: string;

  @ApiProperty({ maxLength: VIDEO_URL_HARD_CAP })
  @IsString()
  @IsNotEmpty()
  // Sanity cap transport — giới hạn nghiệp vụ thật + whitelist domain là service (config MOVIE_MATCH_*)
  @MaxLength(VIDEO_URL_HARD_CAP)
  videoUrl!: string;
}

export class UpdateMovieStateDto {
  @ApiProperty({ description: 'Vị trí phát hiện tại (giây)' })
  @IsNumber()
  @Min(0)
  @Max(24 * 60 * 60) // sanity cap 24h — không phải giới hạn nghiệp vụ, chỉ chặn giá trị rác
  positionSeconds!: number;

  @ApiProperty()
  @IsBoolean()
  isPlaying!: boolean;
}

export class MovieSessionDto {
  @ApiProperty() id!: string;
  @ApiProperty({
    description: 'userId của người bạn còn lại trong phiên (không phải caller)',
  })
  partnerUserId!: string;
  @ApiProperty() videoUrl!: string;
  @ApiProperty() positionSeconds!: number;
  @ApiProperty() isPlaying!: boolean;
  @ApiProperty() positionUpdatedAt!: Date;
  @ApiProperty() status!: string;
  @ApiProperty({ nullable: true, type: Date }) endedAt!: Date | null;
  @ApiProperty({ nullable: true, type: String }) endReason!: string | null;

  static from(session: MovieSession, callerUserId: string): MovieSessionDto {
    const dto = new MovieSessionDto();
    dto.id = session.id;
    dto.partnerUserId =
      session.userLowId === callerUserId
        ? session.userHighId
        : session.userLowId;
    dto.videoUrl = session.videoUrl;
    dto.positionSeconds = session.positionSeconds;
    dto.isPlaying = session.isPlaying;
    dto.positionUpdatedAt = session.positionUpdatedAt;
    dto.status = session.status;
    dto.endedAt = session.endedAt;
    dto.endReason = session.endReason;
    return dto;
  }
}

// ---- flow ghép ẨN DANH (movie-match.html) ----

export class MovieAnonStateDto {
  @ApiProperty({ enum: MovieMatchClientState })
  state!: MovieMatchClientState;
  @ApiPropertyOptional() queuedAt?: string;
  @ApiPropertyOptional() sessionId?: string;
  @ApiPropertyOptional() videoUrl?: string;
  @ApiPropertyOptional() positionSeconds?: number;
  @ApiPropertyOptional() isPlaying?: boolean;
  @ApiPropertyOptional() positionUpdatedAt?: string;
  @ApiPropertyOptional() expiresAt?: string;
  @ApiPropertyOptional({ enum: MovieMatchRating })
  myRating?: MovieMatchRating;
  @ApiPropertyOptional() opponentRated?: boolean;
  @ApiPropertyOptional({ enum: MovieMatchOutcome })
  outcome?: MovieMatchOutcome;
  @ApiPropertyOptional({
    description: 'CHỈ có khi outcome=matched — trước đó 2 bên ẩn danh',
  })
  partnerUserId?: string;

  static from(view: MovieMatchAnonStateView): MovieAnonStateDto {
    return Object.assign(new MovieAnonStateDto(), view);
  }
}

export class RateMovieMatchDto {
  @ApiProperty({ enum: MovieMatchRating })
  @IsEnum(MovieMatchRating)
  rating!: MovieMatchRating;
}

export class SendMovieMessageDto {
  @ApiProperty({ maxLength: MOVIE_MESSAGE_HARD_CAP })
  @IsString()
  // Sanity cap transport — giới hạn thật là config MOVIE_MATCH_MESSAGE_MAX_LENGTH (service check)
  @Length(1, MOVIE_MESSAGE_HARD_CAP)
  content!: string;
}

export class ReactMovieDto {
  @ApiProperty({ enum: [...MOVIE_MATCH_REACTIONS] })
  @IsIn([...MOVIE_MATCH_REACTIONS])
  emoji!: string;
}

export class MovieMessageDto {
  @ApiProperty() id!: string;
  /** Vai trò tương đối — KHÔNG lộ senderUserId (ẩn danh tới khi matched). */
  @ApiProperty({ enum: ['me', 'partner'] })
  sender!: 'me' | 'partner';
  @ApiProperty() content!: string;
  @ApiProperty() sentAt!: Date;

  static from(
    message: MovieSessionMessage,
    callerUserId: string,
  ): MovieMessageDto {
    const dto = new MovieMessageDto();
    dto.id = message.id;
    dto.sender = message.senderUserId === callerUserId ? 'me' : 'partner';
    dto.content = message.content;
    dto.sentAt = message.createdAt;
    return dto;
  }
}

export class MovieMessagesPageDto {
  @ApiProperty({ type: [MovieMessageDto] }) items!: MovieMessageDto[];
  @ApiCursorPageMeta() meta!: CursorPageMeta;
}
