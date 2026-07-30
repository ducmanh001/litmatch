import {
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  Post,
  Res,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  ApiBearerAuth,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { Throttle, minutes } from '@nestjs/throttler';

import {
  CurrentUser,
  type AuthenticatedUser,
} from '../../../common/decorators/current-user.decorator';
import { AuthService } from '../auth.service';
import { setAuthCookies } from '../auth.cookies';
import { AuthTokensDto } from '../dto/auth-tokens.dto';
import { SocialLoginDto, VerifyOtpDto } from '../dto/auth-request.dtos';
import type { CoreApiEnv } from '../../../config/env.validation';
import type { IssuedSession } from '../auth.service';
import type { Response } from 'express';

@ApiTags('auth')
@ApiBearerAuth()
@Controller('auth/upgrade')
export class AuthUpgradeController {
  constructor(
    private readonly authService: AuthService,
    private readonly config: ConfigService<CoreApiEnv, true>,
  ) {}

  @Post('otp')
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 10, ttl: minutes(1) } })
  @ApiOperation({
    summary: 'Gắn phone đã xác minh vào guest hiện tại, giữ nguyên userId',
  })
  @ApiOkResponse({ type: AuthTokensDto })
  async upgradeOtp(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: VerifyOtpDto,
    @Res({ passthrough: true }) res: Response,
  ): Promise<AuthTokensDto> {
    return this.finalize(
      await this.authService.upgradeGuestWithOtp(
        user.userId,
        dto.phone,
        dto.code,
      ),
      res,
    );
  }

  @Post('social')
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 10, ttl: minutes(1) } })
  @ApiOperation({
    summary: 'Gắn social identity vào guest hiện tại, giữ nguyên userId',
  })
  @ApiOkResponse({ type: AuthTokensDto })
  async upgradeSocial(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: SocialLoginDto,
    @Res({ passthrough: true }) res: Response,
  ): Promise<AuthTokensDto> {
    return this.finalize(
      await this.authService.upgradeGuestWithSocial(
        user.userId,
        dto.provider,
        dto.idToken,
      ),
      res,
    );
  }

  private finalize(session: IssuedSession, res: Response): AuthTokensDto {
    setAuthCookies(res, {
      refreshToken: session.refreshToken,
      csrfToken: session.csrfToken,
      isProduction:
        this.config.get('NODE_ENV', { infer: true }) === 'production',
      crossOriginDev:
        this.config.get('AUTH_CROSS_ORIGIN_DEV', { infer: true }) === true,
      productionSameSite: this.config.getOrThrow('AUTH_COOKIE_SAME_SITE', {
        infer: true,
      }),
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
