import { ApiProperty } from '@nestjs/swagger';
import {
  IsBoolean,
  IsNotEmpty,
  IsNumber,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

import { VIDEO_URL_HARD_CAP } from '../movie-match.constants';

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
