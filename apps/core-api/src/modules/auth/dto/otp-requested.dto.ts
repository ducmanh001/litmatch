import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class OtpRequestedDto {
  @ApiPropertyOptional({
    description:
      'Mã OTP 6 chữ số — CHỈ có khi AUTH_OTP_DELIVERY=response (dev/test/e2e) để client hiển thị và tự điền. ' +
      'Khi mã được gửi qua SMS (sms-http) trường này vắng mặt.',
    example: '123456',
  })
  code?: string;

  @ApiProperty({
    description: 'TTL của OTP vừa tạo (giây) — client hiển thị đếm ngược',
  })
  ttlSeconds!: number;
}
