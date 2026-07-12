import { Body, Controller, HttpCode, HttpStatus, Post } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Throttle, minutes } from '@nestjs/throttler';

import { AuthService } from './auth.service';
import { AuthTokensDto } from './dto/auth-tokens.dto';
import { GuestLoginDto, RefreshDto, RequestOtpDto, SocialLoginDto, VerifyOtpDto } from './dto/auth-request.dtos';
import { Public } from '../../common/decorators/public.decorator';

@ApiTags('auth')
@Public()
@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('guest')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Đăng nhập guest bằng deviceId (tài khoản dùng thử, tính năng bị giới hạn — docs/06)' })
  @ApiOkResponse({ type: AuthTokensDto })
  guest(@Body() dto: GuestLoginDto): Promise<AuthTokensDto> {
    return this.authService.guestLogin(dto.deviceId);
  }

  @Post('otp/request')
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 5, ttl: minutes(1) } }) // theo IP; limit theo số điện thoại nằm trong OtpService
  @ApiOperation({ summary: 'Gửi OTP tới số điện thoại' })
  requestOtp(@Body() dto: RequestOtpDto): Promise<{ ttlSeconds: number }> {
    return this.authService.requestOtp(dto.phone);
  }

  @Post('otp/verify')
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 10, ttl: minutes(1) } })
  @ApiOperation({ summary: 'Xác minh OTP và đăng nhập/tạo tài khoản' })
  @ApiOkResponse({ type: AuthTokensDto })
  verifyOtp(@Body() dto: VerifyOtpDto): Promise<AuthTokensDto> {
    return this.authService.verifyOtpAndLogin(dto.phone, dto.code);
  }

  @Post('social')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Đăng nhập bằng Google/Apple ID token (server tự verify chữ ký)' })
  @ApiOkResponse({ type: AuthTokensDto })
  social(@Body() dto: SocialLoginDto): Promise<AuthTokensDto> {
    return this.authService.socialLogin(dto.provider, dto.idToken);
  }

  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Đổi refresh token lấy cặp token mới (rotation, phát hiện reuse)' })
  @ApiOkResponse({ type: AuthTokensDto })
  refresh(@Body() dto: RefreshDto): Promise<AuthTokensDto> {
    return this.authService.refresh(dto.refreshToken);
  }

  @Post('logout')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Thu hồi refresh token' })
  async logout(@Body() dto: RefreshDto): Promise<void> {
    await this.authService.logout(dto.refreshToken);
  }
}
