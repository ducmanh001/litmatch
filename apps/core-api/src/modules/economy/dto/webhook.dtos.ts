import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsObject, IsString } from 'class-validator';

export class AppleServerNotificationDto {
  @ApiProperty({ description: 'JWS — App Store Server Notifications V2' })
  @IsString()
  @IsNotEmpty()
  signedPayload!: string;
}

export class GooglePubSubMessageDto {
  @ApiProperty() @IsString() data!: string;
  @ApiProperty() @IsString() messageId!: string;
  @ApiProperty() @IsString() publishTime!: string;
}

export class GoogleRtdnEnvelopeDto {
  @ApiProperty({ type: GooglePubSubMessageDto })
  @IsObject()
  message!: GooglePubSubMessageDto;

  @ApiProperty() @IsString() subscription!: string;
}
