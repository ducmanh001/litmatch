import { Test } from '@nestjs/testing';
import { getDataSourceToken, getRepositoryToken } from '@nestjs/typeorm';

import { Gender, User, UserService, UserStatus } from '../user';

import { AuthService } from './auth.service';
import { AuthErrors } from './auth.errors';
import { AuthIdentity, AuthProvider } from './entities/auth-identity.entity';
import { OtpService } from './services/otp.service';
import { SocialVerifierService } from './services/social-verifier';
import { TokenService } from './services/token.service';

describe('AuthService', () => {
  const identityRepo = { findOneBy: jest.fn(), findOneByOrFail: jest.fn() };
  const manager = {
    save: jest.fn((e: unknown) => Promise.resolve(e)),
    create: jest.fn((_cls: unknown, obj: object) => obj),
  };
  const dataSource = { transaction: jest.fn(async (cb: (m: typeof manager) => Promise<unknown>) => cb(manager)) };
  const userService = {
    getByIdOrThrow: jest.fn(),
    createWithManager: jest.fn(),
  };
  const tokenService = {
    issueForUser: jest.fn().mockResolvedValue({ accessToken: 'a', refreshToken: 'r', expiresIn: 900 }),
    rotate: jest.fn(),
    revoke: jest.fn(),
  };
  const otpService = { requestOtp: jest.fn(), verifyOtp: jest.fn() };
  const socialVerifier = { verify: jest.fn() };
  let service: AuthService;

  const user = (over: Partial<User> = {}): User =>
    Object.assign(new User(), {
      id: 'u1',
      nickname: 'Khách-123456',
      gender: Gender.Unknown,
      status: UserStatus.Active,
      isGuest: true,
      ...over,
    });

  beforeEach(async () => {
    jest.clearAllMocks();
    const moduleRef = await Test.createTestingModule({
      providers: [
        AuthService,
        { provide: getRepositoryToken(AuthIdentity), useValue: identityRepo },
        { provide: getDataSourceToken(), useValue: dataSource },
        { provide: UserService, useValue: userService },
        { provide: TokenService, useValue: tokenService },
        { provide: OtpService, useValue: otpService },
        { provide: SocialVerifierService, useValue: socialVerifier },
      ],
    }).compile();
    service = moduleRef.get(AuthService);
  });

  it('guest login lần đầu: tạo user + identity trong CÙNG transaction', async () => {
    identityRepo.findOneBy.mockResolvedValue(null);
    userService.createWithManager.mockResolvedValue(user());
    const tokens = await service.guestLogin('device-12345678');
    expect(dataSource.transaction).toHaveBeenCalled();
    expect(userService.createWithManager).toHaveBeenCalledWith(manager, expect.objectContaining({ isGuest: true }));
    expect(tokens.isGuest).toBe(true);
  });

  it('guest login lần sau: tái sử dụng account theo deviceId, không tạo mới', async () => {
    identityRepo.findOneBy.mockResolvedValue({ userId: 'u1' });
    userService.getByIdOrThrow.mockResolvedValue(user());
    await service.guestLogin('device-12345678');
    expect(dataSource.transaction).not.toHaveBeenCalled();
  });

  it('2 request đăng ký song song: unique violation ở DB → đọc lại identity bên thắng (docs/10 § 10.1.C)', async () => {
    identityRepo.findOneBy.mockResolvedValue(null);
    dataSource.transaction.mockRejectedValueOnce(Object.assign(new Error('dup'), { code: '23505' }));
    identityRepo.findOneByOrFail.mockResolvedValue({ userId: 'u1' });
    userService.getByIdOrThrow.mockResolvedValue(user());
    const tokens = await service.guestLogin('device-12345678');
    expect(tokens.userId).toBe('u1');
  });

  it('user bị ban không login lại được', async () => {
    identityRepo.findOneBy.mockResolvedValue({ userId: 'u1' });
    userService.getByIdOrThrow.mockResolvedValue(user({ status: UserStatus.Banned }));
    await expect(service.guestLogin('device-12345678')).rejects.toMatchObject({ code: AuthErrors.USER_BANNED });
  });

  it('refresh: user bị ban GIỮA 2 lần refresh → thu hồi token mới, chặn phiên (docs/10 § 10.0.C)', async () => {
    tokenService.rotate.mockResolvedValue({
      userId: 'u1',
      tokens: { accessToken: 'a', refreshToken: 'r2', expiresIn: 900 },
    });
    userService.getByIdOrThrow.mockResolvedValue(user({ status: UserStatus.Banned, isGuest: false }));
    await expect(service.refresh('r1')).rejects.toMatchObject({ code: AuthErrors.USER_BANNED });
    expect(tokenService.revoke).toHaveBeenCalledWith('r2');
  });

  it('social login: verify ID token ở server trước khi tạo account', async () => {
    socialVerifier.verify.mockResolvedValue({ uid: 'google-sub-1' });
    identityRepo.findOneBy.mockResolvedValue(null);
    userService.createWithManager.mockResolvedValue(user({ isGuest: false }));
    await service.socialLogin(AuthProvider.Google, 'id.token');
    expect(socialVerifier.verify).toHaveBeenCalledWith(AuthProvider.Google, 'id.token');
    expect(identityRepo.findOneBy).toHaveBeenCalledWith({ provider: AuthProvider.Google, providerUid: 'google-sub-1' });
  });
});
