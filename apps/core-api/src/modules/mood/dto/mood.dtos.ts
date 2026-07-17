import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsString, Matches } from 'class-validator';

import type { CurrentMood } from '../mood.service';
import type { MoodPreset } from '../entities/mood-preset.entity';

const PRESET_CODE_PATTERN = /^[a-z0-9_]{1,64}$/u;

export class SetMoodDto {
  @ApiProperty({ example: 'happy' })
  @IsString()
  @Matches(PRESET_CODE_PATTERN, {
    message: 'presetCode phải là chữ thường/số/underscore',
  })
  presetCode!: string;
}

export class MoodPresetDto {
  @ApiProperty() code!: string;
  @ApiProperty() label!: string;
  @ApiProperty() emoji!: string;

  static from(preset: MoodPreset): MoodPresetDto {
    const dto = new MoodPresetDto();
    dto.code = preset.code;
    dto.label = preset.label;
    dto.emoji = preset.emoji;
    return dto;
  }
}

/** Mood hiện tại — `null` (field vắng mặt trong response wrapper) khi không có mood active. */
export class CurrentMoodDto {
  @ApiProperty({ type: MoodPresetDto }) preset!: MoodPresetDto;
  @ApiProperty() setAt!: Date;
  @ApiProperty() expiresAt!: Date;

  static from(mood: CurrentMood): CurrentMoodDto {
    const dto = new CurrentMoodDto();
    dto.preset = MoodPresetDto.from(mood.preset);
    dto.setAt = mood.setAt;
    dto.expiresAt = mood.expiresAt;
    return dto;
  }
}

export class MoodStatusResponseDto {
  @ApiPropertyOptional({ type: CurrentMoodDto, nullable: true })
  mood!: CurrentMoodDto | null;

  static from(mood: CurrentMood | null): MoodStatusResponseDto {
    const dto = new MoodStatusResponseDto();
    dto.mood = mood ? CurrentMoodDto.from(mood) : null;
    return dto;
  }
}
