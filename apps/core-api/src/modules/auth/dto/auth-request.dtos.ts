import { ApiProperty } from '@nestjs/swagger';
import { IsEnum, IsNotEmpty, IsString, Length, Matches } from 'class-validator';

import { AuthProvider } from '../entities/auth-identity.entity';

const PHONE_E164 = /^\+[1-9]\d{7,14}$/;

export class GuestLoginDto {
  @ApiProperty({ description: 'ID thiết bị ổn định do app sinh ra', example: 'a3f1c9d2-device' })
  @IsString()
  @Length(8, 128)
  deviceId!: string;
}

export class RequestOtpDto {
  @ApiProperty({ example: '+84912345678', description: 'Số điện thoại E.164' })
  @Matches(PHONE_E164, { message: 'phone phải theo định dạng E.164 (+84...)' })
  phone!: string;
}

export class VerifyOtpDto {
  @ApiProperty({ example: '+84912345678' })
  @Matches(PHONE_E164)
  phone!: string;

  @ApiProperty({ example: '123456' })
  @Matches(/^\d{6}$/, { message: 'code là 6 chữ số' })
  code!: string;
}

export class SocialLoginDto {
  @ApiProperty({ enum: [AuthProvider.Google, AuthProvider.Apple] })
  @IsEnum(AuthProvider)
  provider!: AuthProvider;

  @ApiProperty({ description: 'ID token từ SDK của provider — server tự verify, không tin client' })
  @IsString()
  @IsNotEmpty()
  idToken!: string;
}

export class RefreshDto {
  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  refreshToken!: string;
}
