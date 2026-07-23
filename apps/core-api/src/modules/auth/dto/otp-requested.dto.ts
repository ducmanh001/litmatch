import { ApiProperty } from '@nestjs/swagger';

export class OtpRequestedDto {
  @ApiProperty({
    description:
      'Mã OTP 6 chữ số — không gửi SMS, client dùng để hiển thị và tự điền',
    example: '123456',
  })
  code!: string;

  @ApiProperty({
    description: 'TTL của OTP vừa tạo (giây) — client hiển thị đếm ngược',
  })
  ttlSeconds!: number;
}
