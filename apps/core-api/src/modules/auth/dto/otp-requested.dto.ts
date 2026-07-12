import { ApiProperty } from '@nestjs/swagger';

export class OtpRequestedDto {
  @ApiProperty({
    description: 'TTL của OTP vừa gửi (giây) — client hiển thị đếm ngược',
  })
  ttlSeconds!: number;
}
