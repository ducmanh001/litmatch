import { ApiProperty } from '@nestjs/swagger';

export enum CapabilityStatus {
  Enabled = 'enabled',
  Beta = 'beta',
  Maintenance = 'maintenance',
  Disabled = 'disabled',
}

export class CapabilityStateDto {
  @ApiProperty({ enum: CapabilityStatus, enumName: 'CapabilityStatus' })
  status!: CapabilityStatus;

  @ApiProperty({
    description:
      'Giải thích ngắn để UI trình bày khi capability không sẵn sàng hoàn toàn',
  })
  message!: string;
}

export class AuthProviderCapabilityDto extends CapabilityStateDto {
  @ApiProperty({
    type: String,
    nullable: true,
    description:
      'OAuth client/app ID công khai; null với provider không cần hoặc chưa cấu hình',
  })
  clientId!: string | null;
}

export class AuthCapabilitiesDto {
  @ApiProperty({ type: AuthProviderCapabilityDto })
  phoneOtp!: AuthProviderCapabilityDto;

  @ApiProperty({ type: AuthProviderCapabilityDto })
  google!: AuthProviderCapabilityDto;

  @ApiProperty({ type: AuthProviderCapabilityDto })
  apple!: AuthProviderCapabilityDto;

  @ApiProperty({ type: AuthProviderCapabilityDto })
  facebook!: AuthProviderCapabilityDto;

  @ApiProperty({ type: CapabilityStateDto })
  guest!: CapabilityStateDto;
}

export class TopUpCapabilitiesDto {
  @ApiProperty({ type: CapabilityStateDto })
  web!: CapabilityStateDto;

  @ApiProperty({
    type: CapabilityStateDto,
    description:
      'Aggregate native IAP; production chỉ enabled khi cả Apple và Google đều sẵn sàng',
  })
  native!: CapabilityStateDto;

  @ApiProperty({ type: CapabilityStateDto })
  nativeApple!: CapabilityStateDto;

  @ApiProperty({ type: CapabilityStateDto })
  nativeGoogle!: CapabilityStateDto;
}

export class VideoCapabilitiesDto {
  @ApiProperty({ type: CapabilityStateDto })
  upload!: CapabilityStateDto;

  @ApiProperty({ type: CapabilityStateDto })
  transcode!: CapabilityStateDto;
}

export class NotificationCapabilitiesDto {
  @ApiProperty({ type: CapabilityStateDto })
  push!: CapabilityStateDto;
}

export class CapabilitiesDto {
  @ApiProperty({ type: AuthCapabilitiesDto })
  auth!: AuthCapabilitiesDto;

  @ApiProperty({ type: TopUpCapabilitiesDto })
  topUp!: TopUpCapabilitiesDto;

  @ApiProperty({ type: VideoCapabilitiesDto })
  video!: VideoCapabilitiesDto;

  @ApiProperty({ type: NotificationCapabilitiesDto })
  notifications!: NotificationCapabilitiesDto;
}
