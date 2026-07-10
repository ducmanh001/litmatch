import { randomInt } from 'node:crypto';

import { Injectable } from '@nestjs/common';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import { DomainException } from '@litmatch/common-exceptions';
import { DataSource, Repository } from 'typeorm';

import { User, UserService, UserStatus } from '../user';

import { AuthErrors } from './auth.errors';
import { AuthIdentity, AuthProvider } from './entities/auth-identity.entity';
import { OtpService } from './services/otp.service';
import { SocialVerifierService } from './services/social-verifier';
import { TokenService } from './services/token.service';

import type { AuthTokensDto } from './dto/auth-tokens.dto';

const PG_UNIQUE_VIOLATION = '23505';

@Injectable()
export class AuthService {
  constructor(
    @InjectRepository(AuthIdentity) private readonly identityRepo: Repository<AuthIdentity>,
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly userService: UserService,
    private readonly tokenService: TokenService,
    private readonly otpService: OtpService,
    private readonly socialVerifier: SocialVerifierService,
  ) {}

  async guestLogin(deviceId: string): Promise<AuthTokensDto> {
    const user = await this.findOrCreateUser(AuthProvider.Guest, deviceId, { isGuest: true, nicknamePrefix: 'Khách' });
    return this.issue(user);
  }

  async requestOtp(phone: string): Promise<{ ttlSeconds: number }> {
    return this.otpService.requestOtp(phone);
  }

  async verifyOtpAndLogin(phone: string, code: string): Promise<AuthTokensDto> {
    await this.otpService.verifyOtp(phone, code);
    const user = await this.findOrCreateUser(AuthProvider.Phone, phone, { isGuest: false, nicknamePrefix: 'User' });
    return this.issue(user);
  }

  async socialLogin(provider: AuthProvider, idToken: string): Promise<AuthTokensDto> {
    const identity = await this.socialVerifier.verify(provider, idToken);
    const user = await this.findOrCreateUser(provider, identity.uid, { isGuest: false, nicknamePrefix: 'User' });
    return this.issue(user);
  }

  async refresh(refreshToken: string): Promise<AuthTokensDto> {
    const { userId, tokens } = await this.tokenService.rotate(refreshToken);
    // Xác minh lại trạng thái ĐÚNG THỜI ĐIỂM hành động (docs/10 § 10.0.C):
    // user bị ban giữa 2 lần refresh thì không được cấp phiên mới
    const user = await this.userService.getByIdOrThrow(userId);
    if (user.status !== UserStatus.Active) {
      await this.tokenService.revoke(tokens.refreshToken);
      throw new DomainException(AuthErrors.USER_BANNED, 'Tài khoản đã bị khoá', 403);
    }
    return { ...tokens, userId: user.id, isGuest: user.isGuest };
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
    const existing = await this.identityRepo.findOneBy({ provider, providerUid });
    if (existing) {
      return this.assertActive(await this.userService.getByIdOrThrow(existing.userId));
    }

    try {
      return await this.dataSource.transaction(async (manager) => {
        const user = await this.userService.createWithManager(manager, {
          nickname: `${opts.nicknamePrefix}-${randomInt(100000, 999999)}`,
          isGuest: opts.isGuest,
        });
        await manager.save(manager.create(AuthIdentity, { userId: user.id, provider, providerUid }));
        return user;
      });
    } catch (err) {
      if ((err as { code?: string }).code === PG_UNIQUE_VIOLATION) {
        const identity = await this.identityRepo.findOneByOrFail({ provider, providerUid });
        return this.assertActive(await this.userService.getByIdOrThrow(identity.userId));
      }
      throw err;
    }
  }

  private assertActive(user: User): User {
    if (user.status !== UserStatus.Active) {
      throw new DomainException(AuthErrors.USER_BANNED, 'Tài khoản đã bị khoá', 403);
    }
    return user;
  }

  private async issue(user: User): Promise<AuthTokensDto> {
    const tokens = await this.tokenService.issueForUser(user.id, user.isGuest);
    return { ...tokens, userId: user.id, isGuest: user.isGuest };
  }
}
