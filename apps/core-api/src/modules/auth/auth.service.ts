import { randomInt } from 'node:crypto';

import { HttpStatus, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import { DomainException } from '@litmatch/common-exceptions';
import { DataSource, Repository } from 'typeorm';

import { isUniqueViolation } from '../../database/postgres-errors';
import { User, UserService, UserStatus } from '../user';

import { generateCsrfToken } from '../../common/csrf/csrf-token';

import { AuthErrors } from './auth.errors';
import { AuthIdentity, AuthProvider } from './entities/auth-identity.entity';
import { OtpService } from './services/otp.service';
import { SocialVerifierService } from './services/social-verifier';
import { TokenService } from './services/token.service';

import type { CoreApiEnv } from '../../config/env.validation';

/**
 * Kết quả nội bộ giữa Service ↔ Controller (ADR 0007) — có `refreshToken` plain vì Controller
 * cần giá trị này để set cookie httpOnly. KHÔNG bao giờ trả nguyên object này ra HTTP response
 * — Controller phải tự bóc `refreshToken` ra trước khi build `AuthTokensDto` công khai.
 */
export interface IssuedSession {
  accessToken: string;
  refreshToken: string;
  csrfToken: string;
  expiresIn: number;
  userId: string;
  isGuest: boolean;
}

@Injectable()
export class AuthService {
  constructor(
    @InjectRepository(AuthIdentity)
    private readonly identityRepo: Repository<AuthIdentity>,
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly userService: UserService,
    private readonly tokenService: TokenService,
    private readonly otpService: OtpService,
    private readonly socialVerifier: SocialVerifierService,
    private readonly config: ConfigService<CoreApiEnv, true>,
  ) {}

  async guestLogin(deviceId: string): Promise<IssuedSession> {
    const user = await this.findOrCreateUser(AuthProvider.Guest, deviceId, {
      isGuest: true,
      nicknamePrefix: 'Khách',
    });
    return this.issue(user);
  }

  async requestOtp(phone: string): Promise<{ ttlSeconds: number }> {
    this.assertPhoneOtpEnabled();
    return this.otpService.requestOtp(phone);
  }

  async verifyOtpAndLogin(phone: string, code: string): Promise<IssuedSession> {
    this.assertPhoneOtpEnabled();
    await this.otpService.verifyOtp(phone, code);
    const user = await this.findOrCreateUser(AuthProvider.Phone, phone, {
      isGuest: false,
      nicknamePrefix: 'User',
    });
    return this.issue(user);
  }

  async socialLogin(
    provider: AuthProvider,
    idToken: string,
  ): Promise<IssuedSession> {
    const identity = await this.socialVerifier.verify(provider, idToken);
    const user = await this.findOrCreateUser(provider, identity.uid, {
      isGuest: false,
      nicknamePrefix: 'User',
    });
    return this.issue(user);
  }

  async refresh(refreshToken: string): Promise<IssuedSession> {
    const { userId, tokens } = await this.tokenService.rotate(refreshToken);
    // Xác minh lại trạng thái ĐÚNG THỜI ĐIỂM hành động (docs/10 § 10.0.C):
    // user bị ban giữa 2 lần refresh thì không được cấp phiên mới
    const user = await this.userService.getByIdOrThrow(userId);
    try {
      this.assertActive(user);
    } catch (err) {
      await this.tokenService.revoke(tokens.refreshToken);
      throw err;
    }
    return {
      ...tokens,
      csrfToken: generateCsrfToken(),
      userId: user.id,
      isGuest: user.isGuest,
    };
  }

  async logout(refreshToken: string): Promise<void> {
    await this.tokenService.revoke(refreshToken);
  }

  /**
   * Find-or-create an toàn dưới race: unique(provider, providerUid) ở DB là chốt chặn cuối —
   * 2 request đầu tiên song song thì 1 bên nhận unique violation và đọc lại identity của bên kia.
   */
  private async findOrCreateUser(
    provider: AuthProvider,
    providerUid: string,
    opts: { isGuest: boolean; nicknamePrefix: string },
  ): Promise<User> {
    const existing = await this.identityRepo.findOneBy({
      provider,
      providerUid,
    });
    if (existing) {
      return this.assertActive(
        await this.userService.getByIdOrThrow(existing.userId),
      );
    }

    try {
      return await this.dataSource.transaction(async (manager) => {
        const user = await this.userService.createWithManager(manager, {
          nickname: `${opts.nicknamePrefix}-${randomInt(100000, 999999)}`,
          isGuest: opts.isGuest,
        });
        await manager.save(
          manager.create(AuthIdentity, {
            userId: user.id,
            provider,
            providerUid,
          }),
        );
        return user;
      });
    } catch (err) {
      if (isUniqueViolation(err)) {
        const identity = await this.identityRepo.findOneByOrFail({
          provider,
          providerUid,
        });
        return this.assertActive(
          await this.userService.getByIdOrThrow(identity.userId),
        );
      }
      throw err;
    }
  }

  private assertActive(user: User): User {
    if (user.status !== UserStatus.Active) {
      throw new DomainException(
        AuthErrors.USER_BANNED,
        'Tài khoản đã bị khoá',
        HttpStatus.FORBIDDEN,
      );
    }
    return user;
  }

  private assertPhoneOtpEnabled(): void {
    if (this.config.getOrThrow('AUTH_PHONE_OTP_ENABLED', { infer: true }))
      return;
    throw new DomainException(
      AuthErrors.PHONE_OTP_DISABLED,
      'Đăng nhập bằng số điện thoại chưa khả dụng trên môi trường này',
      HttpStatus.FORBIDDEN,
    );
  }

  private async issue(user: User): Promise<IssuedSession> {
    const tokens = await this.tokenService.issueForUser(
      user.id,
      user.isGuest,
      user.role,
    );
    return {
      ...tokens,
      csrfToken: generateCsrfToken(),
      userId: user.id,
      isGuest: user.isGuest,
    };
  }
}
