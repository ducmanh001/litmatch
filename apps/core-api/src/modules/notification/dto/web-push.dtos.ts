import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsNumber,
  IsOptional,
  IsString,
  IsUrl,
  Length,
  ValidateNested,
} from 'class-validator';

export class WebPushSubscriptionKeysDto {
  @ApiProperty({ minLength: 1, maxLength: 255 })
  @IsString()
  @Length(1, 255)
  p256dh!: string;

  @ApiProperty({ minLength: 1, maxLength: 255 })
  @IsString()
  @Length(1, 255)
  auth!: string;
}

export class UpsertWebPushSubscriptionDto {
  @ApiProperty({ maxLength: 2048 })
  @IsUrl({ protocols: ['https'], require_protocol: true })
  @Length(1, 2048)
  endpoint!: string;

  @ApiPropertyOptional({ nullable: true, type: Number })
  @IsOptional()
  @IsNumber()
  expirationTime?: number | null;

  @ApiProperty({ type: WebPushSubscriptionKeysDto })
  @ValidateNested()
  @Type(() => WebPushSubscriptionKeysDto)
  keys!: WebPushSubscriptionKeysDto;
}

export class DeleteWebPushSubscriptionDto {
  @ApiProperty({ maxLength: 2048 })
  @IsUrl({ protocols: ['https'], require_protocol: true })
  @Length(1, 2048)
  endpoint!: string;
}
