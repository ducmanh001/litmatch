import {
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  Post,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Throttle, minutes } from '@nestjs/throttler';

import { CsrfGuard } from '../../common/guards/csrf.guard';

import { AuthService } from './auth.service';
import {
  clearAuthCookies,
  extractRefreshTokenCookie,
  setAuthCookies,
} from './auth.cookies';
import { AuthTokensDto } from './dto/auth-tokens.dto';
import { OtpRequestedDto } from './dto/otp-requested.dto';
import {
  GuestLoginDto,
  RequestOtpDto,
  SocialLoginDto,
  VerifyOtpDto,
} from './dto/auth-request.dtos';
import { Public } from '../../common/decorators/public.decorator';

import type { CoreApiEnv } from '../../config/env.validation';
import type { IssuedSession } from './auth.service';
import type { Request, Response } from 'express';

@ApiTags('auth')
@Public()
@Controller('auth')
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly config: ConfigService<CoreApiEnv, true>,
  ) {}

  @Post('guest')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary:
      'Đăng nhập guest bằng deviceId (tài khoản dùng thử, tính năng bị giới hạn — docs/06)',
  })
  @ApiOkResponse({ type: AuthTokensDto })
  async guest(
    @Body() dto: GuestLoginDto,
    @Res({ passthrough: true }) res: Response,
  ): Promise<AuthTokensDto> {
    return this.finalizeSession(
      await this.authService.guestLogin(dto.deviceId),
      res,
    );
  }

  @Post('otp/request')
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 5, ttl: minutes(1) } }) // theo IP; limit theo số điện thoại nằm trong OtpService
  @ApiOperation({ summary: 'Gửi OTP tới số điện thoại' })
  @ApiOkResponse({ type: OtpRequestedDto })
  requestOtp(@Body() dto: RequestOtpDto): Promise<{ ttlSeconds: number }> {
    return this.authService.requestOtp(dto.phone);
  }

  @Post('otp/verify')
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 10, ttl: minutes(1) } })
  @ApiOperation({ summary: 'Xác minh OTP và đăng nhập/tạo tài khoản' })
  @ApiOkResponse({ type: AuthTokensDto })
  async verifyOtp(
    @Body() dto: VerifyOtpDto,
    @Res({ passthrough: true }) res: Response,
  ): Promise<AuthTokensDto> {
    return this.finalizeSession(
      await this.authService.verifyOtpAndLogin(dto.phone, dto.code),
      res,
    );
  }

  @Post('social')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Đăng nhập bằng Google/Apple ID token (server tự verify chữ ký)',
  })
  @ApiOkResponse({ type: AuthTokensDto })
  async social(
    @Body() dto: SocialLoginDto,
    @Res({ passthrough: true }) res: Response,
  ): Promise<AuthTokensDto> {
    return this.finalizeSession(
      await this.authService.socialLogin(dto.provider, dto.idToken),
      res,
    );
  }

  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  @UseGuards(CsrfGuard)
  @ApiOperation({
    summary:
      'Đổi refresh token (cookie httpOnly) lấy cặp token mới (rotation, phát hiện reuse) — cần header X-CSRF-Token (ADR 0007)',
  })
  @ApiOkResponse({ type: AuthTokensDto })
  async refresh(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<AuthTokensDto> {
    const refreshToken = extractRefreshTokenCookie(req);
    return this.finalizeSession(
      await this.authService.refresh(refreshToken),
      res,
    );
  }

  @Post('logout')
  @HttpCode(HttpStatus.NO_CONTENT)
  @UseGuards(CsrfGuard)
  @ApiOperation({
    summary:
      'Thu hồi refresh token, xoá cookie — cần header X-CSRF-Token (ADR 0007)',
  })
  async logout(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<void> {
    const refreshToken = extractRefreshTokenCookie(req);
    await this.authService.logout(refreshToken);
    clearAuthCookies(
      res,
      this.config.get('NODE_ENV', { infer: true }) === 'production',
      this.config.get('AUTH_CROSS_ORIGIN_DEV', { infer: true }) === true,
    );
  }

  /** Set cookie httpOnly + bóc `refreshToken` ra trước khi trả response công khai (ADR 0007). */
  private finalizeSession(
    session: IssuedSession,
    res: Response,
  ): AuthTokensDto {
    setAuthCookies(res, {
      refreshToken: session.refreshToken,
      csrfToken: session.csrfToken,
      isProduction:
        this.config.get('NODE_ENV', { infer: true }) === 'production',
      crossOriginDev:
        this.config.get('AUTH_CROSS_ORIGIN_DEV', { infer: true }) === true,
      ttlDays: this.config.getOrThrow('AUTH_REFRESH_TTL_DAYS', { infer: true }),
    });
    return {
      accessToken: session.accessToken,
      csrfToken: session.csrfToken,
      expiresIn: session.expiresIn,
      userId: session.userId,
      isGuest: session.isGuest,
    };
  }
}
