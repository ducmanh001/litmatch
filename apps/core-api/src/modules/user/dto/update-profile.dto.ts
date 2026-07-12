import { ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsEnum,
  IsISO8601,
  IsOptional,
  IsString,
  Length,
  Matches,
} from 'class-validator';

import { Gender } from '../entities/user.entity';

export class UpdateProfileDto {
  @ApiPropertyOptional({ example: 'Mưa Đêm' })
  @IsOptional()
  @IsString()
  @Length(2, 50)
  nickname?: string;

  @ApiPropertyOptional({ enum: Gender })
  @IsOptional()
  @IsEnum(Gender)
  gender?: Gender;

  @ApiPropertyOptional({
    example: '2000-01-31',
    description: 'Ngày sinh ISO — server kiểm tra tuổi tối thiểu (docs/06)',
  })
  @IsOptional()
  @IsISO8601({ strict: true })
  birthDate?: string;

  @ApiPropertyOptional({
    example: 'VN',
    description: 'Mã region ISO 3166-1 alpha-2',
  })
  @IsOptional()
  @Matches(/^[A-Z]{2}$/)
  region?: string;
}
