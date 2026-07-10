import { createHmac } from 'node:crypto';

import { Test } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { getRepositoryToken } from '@nestjs/typeorm';

import { OtpService } from './otp.service';
import { SmsProvider } from './sms-provider';
import { AuthErrors } from '../auth.errors';
import { PhoneOtp } from '../entities/phone-otp.entity';

const PEPPER = 'test-pepper-0123456789abcdef';
const PHONE = '+84912345678';

describe('OtpService', () => {
  const qb = {
    update: jest.fn().mockReturnThis(),
    set: jest.fn().mockReturnThis(),
    where: jest.fn().mockReturnThis(),
    execute: jest.fn(),
  };
  const repo = {
    countBy: jest.fn(),
    update: jest.fn(),
    save: jest.fn((o: PhoneOtp) => Promise.resolve(o)),
    create: jest.fn((o: Partial<PhoneOtp>) => o),
    findOne: jest.fn(),
    createQueryBuilder: jest.fn(() => qb),
  };
  const sms = { send: jest.fn() };
  const config = {
    getOrThrow: jest.fn(
      (key: string) =>
        ({
          AUTH_OTP_REQUESTS_PER_HOUR: 5,
          AUTH_OTP_TTL_SECONDS: 300,
          AUTH_OTP_MAX_ATTEMPTS: 5,
          AUTH_OTP_PEPPER: PEPPER,
        })[key],
    ),
  };
  let service: OtpService;

  const hash = (code: string) => createHmac('sha256', PEPPER).update(`${PHONE}:${code}`).digest('hex');
  const storedOtp = (over: Partial<PhoneOtp> = {}): PhoneOtp =>
    Object.assign(new PhoneOtp(), {
      id: 'otp1',
      phone: PHONE,
      codeHash: hash('123456'),
      expiresAt: new Date(Date.now() + 300_000),
      attemptCount: 0,
      consumedAt: null,
      ...over,
    });

  beforeEach(async () => {
    jest.clearAllMocks();
    const moduleRef = await Test.createTestingModule({
      providers: [
        OtpService,
        { provide: getRepositoryToken(PhoneOtp), useValue: repo },
        { provide: SmsProvider, useValue: sms },
        { provide: ConfigService, useValue: config },
      ],
    }).compile();
    service = moduleRef.get(OtpService);
  });

  describe('requestOtp', () => {
    it('tạo OTP mới, vô hiệu OTP cũ, gửi SMS', async () => {
      repo.countBy.mockResolvedValue(0);
      repo.update.mockResolvedValue({ affected: 1 });
      const result = await service.requestOtp(PHONE);
      expect(result.ttlSeconds).toBe(300);
      expect(repo.update).toHaveBeenCalled(); // vô hiệu mã cũ
      expect(sms.send).toHaveBeenCalledWith(PHONE, expect.stringMatching(/\d{6}/));
    });

    it('rate limit theo số điện thoại ở server — không phải chỉ ở FE (docs/10 § 10.1.H)', async () => {
      repo.countBy.mockResolvedValue(5);
      await expect(service.requestOtp(PHONE)).rejects.toMatchObject({
        code: AuthErrors.OTP_REQUEST_RATE_LIMITED,
        httpStatus: 429,
      });
      expect(sms.send).not.toHaveBeenCalled();
    });
  });

  describe('verifyOtp', () => {
    it('mã đúng → consume thành công', async () => {
      repo.findOne.mockResolvedValue(storedOtp());
      qb.execute.mockResolvedValue({ affected: 1 });
      repo.update.mockResolvedValue({ affected: 1 });
      await expect(service.verifyOtp(PHONE, '123456')).resolves.toBeUndefined();
    });

    it('không có OTP hoặc hết hạn → AUTH_OTP_EXPIRED', async () => {
      repo.findOne.mockResolvedValue(null);
      await expect(service.verifyOtp(PHONE, '123456')).rejects.toMatchObject({ code: AuthErrors.OTP_EXPIRED });

      repo.findOne.mockResolvedValue(storedOtp({ expiresAt: new Date(Date.now() - 1000) }));
      await expect(service.verifyOtp(PHONE, '123456')).rejects.toMatchObject({ code: AuthErrors.OTP_EXPIRED });
    });

    it('vượt số lần thử (UPDATE có điều kiện affected=0, an toàn dưới request song song) → TOO_MANY_ATTEMPTS', async () => {
      repo.findOne.mockResolvedValue(storedOtp({ attemptCount: 5 }));
      qb.execute.mockResolvedValue({ affected: 0 });
      await expect(service.verifyOtp(PHONE, '123456')).rejects.toMatchObject({
        code: AuthErrors.OTP_TOO_MANY_ATTEMPTS,
      });
    });

    it('mã sai → AUTH_OTP_INVALID, không consume', async () => {
      repo.findOne.mockResolvedValue(storedOtp());
      qb.execute.mockResolvedValue({ affected: 1 });
      await expect(service.verifyOtp(PHONE, '999999')).rejects.toMatchObject({ code: AuthErrors.OTP_INVALID });
      expect(repo.update).not.toHaveBeenCalled();
    });

    it('2 request song song cùng mã đúng — chỉ 1 bên consume được (docs/10 § 10.0.D)', async () => {
      repo.findOne.mockResolvedValue(storedOtp());
      qb.execute.mockResolvedValue({ affected: 1 });
      repo.update.mockResolvedValue({ affected: 0 }); // bên kia đã consume trước
      await expect(service.verifyOtp(PHONE, '123456')).rejects.toMatchObject({ code: AuthErrors.OTP_INVALID });
    });
  });
});
