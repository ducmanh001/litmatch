import { ApiProperty } from '@nestjs/swagger';
import { IsBoolean, IsObject, IsOptional, IsString } from 'class-validator';

/** Envelope payOS giữ nguyên data cho HMAC; service chỉ dùng whitelist field sau verify. */
export class PayosWebhookDto {
  @ApiProperty() @IsString() code!: string;
  @ApiProperty() @IsBoolean() success!: boolean;
  @ApiProperty({ type: 'object', additionalProperties: true })
  @IsObject()
  data!: Record<string, unknown>;
  @ApiProperty() @IsString() signature!: string;
  @ApiProperty({ required: false }) @IsOptional() @IsString() desc?: string;
}
