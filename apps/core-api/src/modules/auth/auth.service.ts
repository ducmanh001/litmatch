import { randomInt } from 'node:crypto';

import { HttpStatus, Inject, Injectable } from '@nestjs/common';
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
import { GuestDeviceTokenService } from './services/guest-device-token.service';
import { RefreshSessionPort } from './ports/refresh-session.port';

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
  guestDeviceToken?: string;
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
    private readonly guestDeviceTokens: GuestDeviceTokenService,
    @Inject(RefreshSessionPort)
    private readonly refreshSessions: RefreshSessionPort,
    private readonly config: ConfigService<CoreApiEnv, true>,
  ) {}

  async guestLogin(deviceId: string): Promise<IssuedSession> {
    const user = await this.findOrCreateUser(AuthProvider.Guest, deviceId, {
      isGuest: true,
      nicknamePrefix: 'Khách',
    });
    return {
      ...(await this.issue(user)),
      guestDeviceToken: await this.guestDeviceTokens.issue(user.id, deviceId),
    };
  }

  async requestOtp(
    phone: string,
  ): Promise<{ code: string; ttlSeconds: number }> {
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

  /**
   * Upgrade gắn identity vào chính user đang đăng nhập. Không tạo/migrate user; unique
   * (provider, providerUid) là chốt conflict cuối dưới race.
   */
  async upgradeGuestWithOtp(
    userId: string,
    phone: string,
    code: string,
  ): Promise<IssuedSession> {
    this.assertPhoneOtpEnabled();
    if (!(await this.isIdentityOwnedBy(userId, AuthProvider.Phone, phone))) {
      await this.otpService.verifyOtp(phone, code);
    }
    return this.issue(
      await this.linkIdentityAndUpgrade(userId, AuthProvider.Phone, phone),
    );
  }

  async upgradeGuestWithSocial(
    userId: string,
    provider: AuthProvider,
    idToken: string,
  ): Promise<IssuedSession> {
    const identity = await this.socialVerifier.verify(provider, idToken);
    return this.issue(
      await this.linkIdentityAndUpgrade(userId, provider, identity.uid),
    );
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
      const user = this.assertActive(
        await this.userService.getByIdOrThrow(existing.userId),
      );
      this.assertGuestIdentityStillActive(provider, user);
      return user;
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
          this.assertGuestIdentityStillActive(
            provider,
            await this.userService.getByIdOrThrow(identity.userId),
          ),
        );
      }
      throw err;
    }
  }

  private async isIdentityOwnedBy(
    userId: string,
    provider: AuthProvider,
    providerUid: string,
  ): Promise<boolean> {
    const existing = await this.identityRepo.findOneBy({
      provider,
      providerUid,
    });
    if (!existing) return false;
    if (existing.userId === userId) return true;
    throw new DomainException(
      AuthErrors.IDENTITY_ALREADY_LINKED,
      'Identity đã gắn với một tài khoản khác; hãy đăng nhập tài khoản đó',
      HttpStatus.CONFLICT,
    );
  }

  private async linkIdentityAndUpgrade(
    userId: string,
    provider: AuthProvider,
    providerUid: string,
  ): Promise<User> {
    try {
      const user = await this.dataSource.transaction(async (manager) => {
        const user = await manager.findOne(User, {
          where: { id: userId },
          lock: { mode: 'pessimistic_write' },
        });
        if (!user) return this.userService.getByIdOrThrow(userId);
        this.assertActive(user);

        const existing = await manager.findOneBy(AuthIdentity, {
          provider,
          providerUid,
        });
        if (existing && existing.userId !== userId) {
          throw new DomainException(
            AuthErrors.IDENTITY_ALREADY_LINKED,
            'Identity đã gắn với một tài khoản khác; không tự động merge tài khoản',
            HttpStatus.CONFLICT,
          );
        }
        if (!user.isGuest && !existing) {
          throw new DomainException(
            AuthErrors.GUEST_UPGRADE_NOT_ALLOWED,
            'Tài khoản không còn là guest; không thể gắn identity mới qua luồng upgrade',
            HttpStatus.CONFLICT,
          );
        }
        if (!existing) {
          await manager.insert(AuthIdentity, {
            userId,
            provider,
            providerUid,
          });
        }
        if (user.isGuest) {
          // Credential guest và mọi refresh session cũ không được “đi theo” thành quyền account
          // thật; revoke cùng manager để không commit upgrade nửa chừng.
          await manager.delete(AuthIdentity, {
            userId,
            provider: AuthProvider.Guest,
          });
          user.isGuest = false;
          await manager.save(user);
          await this.refreshSessions.revokeForUser(userId, manager);
        }
        return user;
      });
      return user;
    } catch (err) {
      if (!isUniqueViolation(err)) throw err;
      // Request song song cùng identity: transaction thua đọc winner rồi phân loại replay/conflict.
      const existing = await this.identityRepo.findOneByOrFail({
        provider,
        providerUid,
      });
      if (existing.userId !== userId) {
        throw new DomainException(
          AuthErrors.IDENTITY_ALREADY_LINKED,
          'Identity đã gắn với một tài khoản khác; không tự động merge tài khoản',
          HttpStatus.CONFLICT,
        );
      }
      await this.dataSource.transaction(async (manager) => {
        const updated = await manager.update(
          User,
          { id: userId, isGuest: true },
          { isGuest: false },
        );
        if (updated.affected) {
          await this.refreshSessions.revokeForUser(userId, manager);
        }
      });
      return this.assertActive(await this.userService.getByIdOrThrow(userId));
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

  private assertGuestIdentityStillActive(
    provider: AuthProvider,
    user: User,
  ): User {
    if (provider !== AuthProvider.Guest || user.isGuest) return user;
    throw new DomainException(
      AuthErrors.GUEST_IDENTITY_RETIRED,
      'Guest credential đã bị thu hồi sau khi nâng cấp tài khoản',
      HttpStatus.UNAUTHORIZED,
    );
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
