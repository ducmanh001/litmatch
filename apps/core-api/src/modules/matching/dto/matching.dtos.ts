import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsDefined, IsEnum, IsIn, IsInt, Max, Min, ValidateNested } from 'class-validator';

import { MatchType } from '../entities/match-ticket.entity';
import { MatchTicketStatus } from '../entities/match-ticket.entity';

import { Gender } from '../../user';

export class MatchCriteriaDto {
  @ApiProperty({ enum: [Gender.Male, Gender.Female, 'any'], example: 'any' })
  @IsIn([Gender.Male, Gender.Female, 'any'])
  genderPref!: Gender.Male | Gender.Female | 'any';

  @ApiProperty({ example: 18 })
  @IsInt()
  @Min(18)
  @Max(99)
  minAge!: number;

  @ApiProperty({ example: 99 })
  @IsInt()
  @Min(18)
  @Max(99)
  maxAge!: number;
}

export class CreateMatchTicketDto {
  @ApiProperty({ enum: MatchType })
  @IsEnum(MatchType)
  matchType!: MatchType;

  @ApiProperty({ type: MatchCriteriaDto })
  @IsDefined()
  @ValidateNested()
  @Type(() => MatchCriteriaDto)
  criteria!: MatchCriteriaDto;
}

export class MatchTicketDto {
  @ApiProperty() id!: string;
  @ApiProperty({ enum: MatchType }) matchType!: MatchType;
  @ApiProperty({ enum: MatchTicketStatus }) status!: MatchTicketStatus;
  @ApiProperty() priority!: boolean;
  @ApiPropertyOptional({ nullable: true }) matchSessionId!: string | null;
  @ApiProperty() queuedAt!: Date;
  @ApiProperty() expiresAt!: Date;
}
