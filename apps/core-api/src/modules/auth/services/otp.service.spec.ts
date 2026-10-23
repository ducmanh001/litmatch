import { createHmac } from 'node:crypto';

import { Logger, ServiceUnavailableException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { getRepositoryToken } from '@nestjs/typeorm';

import { OtpService } from './otp.service';
import { AuthErrors } from '../auth.errors';
import { PhoneOtp } from '../entities/phone-otp.entity';
import { OtpSenderPort } from '../ports/otp-sender.port';
import { AuthMetrics } from './auth.metrics';

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
  const sender = { send: jest.fn() };
  const metrics = { observeOtpDelivery: jest.fn() };
  const settings: Record<string, unknown> = {};
  const config = {
    getOrThrow: jest.fn(
      (key: string) =>
        ({
          AUTH_OTP_REQUESTS_PER_HOUR: 5,
          AUTH_OTP_TTL_SECONDS: 300,
          AUTH_OTP_MAX_ATTEMPTS: 5,
          AUTH_OTP_PEPPER: PEPPER,
          AUTH_OTP_DELIVERY: 'response',
          AUTH_PHONE_OTP_ENABLED: true,
          NODE_ENV: 'development',
          AUTH_OTP_SMS_TEMPLATE:
            'Ma OTP la {code}, het han sau {minutes} phut.',
          ...settings,
        })[key],
    ),
  };
  let service: OtpService;

  const hash = (code: string) =>
    createHmac('sha256', PEPPER).update(`${PHONE}:${code}`).digest('hex');
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
    for (const key of Object.keys(settings)) delete settings[key];
    sender.send.mockResolvedValue(undefined);
    const moduleRef = await Test.createTestingModule({
      providers: [
        OtpService,
        { provide: getRepositoryToken(PhoneOtp), useValue: repo },
        { provide: ConfigService, useValue: config },
        { provide: OtpSenderPort, useValue: sender },
        { provide: AuthMetrics, useValue: metrics },
      ],
    }).compile();
    service = moduleRef.get(OtpService);
  });

  describe('requestOtp', () => {
    it('tạo OTP mới, vô hiệu OTP cũ, trả mã cho client tự điền', async () => {
      repo.countBy.mockResolvedValue(0);
      repo.update.mockResolvedValue({ affected: 1 });
      const result = await service.requestOtp(PHONE);
      expect(result.code).toMatch(/^\d{6}$/u);
      expect(result.ttlSeconds).toBe(300);
      expect(repo.update).toHaveBeenCalled(); // vô hiệu mã cũ
    });

    it('rate limit theo số điện thoại ở server — không phải chỉ ở FE (docs/10 § 10.1.H)', async () => {
      repo.countBy.mockResolvedValue(5);
      await expect(service.requestOtp(PHONE)).rejects.toMatchObject({
        code: AuthErrors.OTP_REQUEST_RATE_LIMITED,
        httpStatus: 429,
      });
    });

    it('delivery=response (dev/test): trả mã trong response và KHÔNG gọi cổng SMS', async () => {
      repo.countBy.mockResolvedValue(0);
      repo.update.mockResolvedValue({ affected: 1 });
      const result = await service.requestOtp(PHONE);
      expect(result.code).toMatch(/^\d{6}$/u);
      expect(sender.send).not.toHaveBeenCalled();
    });

    describe('delivery=sms-http (production)', () => {
      beforeEach(() => {
        settings['AUTH_OTP_DELIVERY'] = 'sms-http';
        settings['NODE_ENV'] = 'production';
        repo.countBy.mockResolvedValue(0);
        repo.update.mockResolvedValue({ affected: 1 });
        repo.save.mockImplementation((o: Partial<PhoneOtp>) =>
          Promise.resolve({ ...o, id: 'otp-new' } as PhoneOtp),
        );
      });

      it('response KHÔNG chứa mã; SMS chứa đúng mã + số phút còn hiệu lực, reference là id bản ghi', async () => {
        const result = await service.requestOtp(PHONE);

        expect(result).toEqual({ ttlSeconds: 300 });
        expect(result).not.toHaveProperty('code');
        expect(sender.send).toHaveBeenCalledTimes(1);
        const input = sender.send.mock.calls[0][0] as {
          phone: string;
          message: string;
          reference: string;
        };
        expect(input.phone).toBe(PHONE);
        expect(input.reference).toBe('otp-new');
        expect(input.message).toMatch(
          /^Ma OTP la \d{6}, het han sau 5 phut\.$/u,
        );
        // Mã trong SMS khớp hash đã lưu — người dùng nhập đúng mã SMS là qua được verify
        const smsCode = /\d{6}/u.exec(input.message)?.[0] ?? '';
        const saved = repo.save.mock.calls[0][0] as { codeHash: string };
        expect(saved.codeHash).toBe(hash(smsCode));
        expect(metrics.observeOtpDelivery).toHaveBeenCalledWith('sent');
      });

      it('thứ tự: lưu mã mới → giao SMS → CHỈ SAU ĐÓ vô hiệu mã cũ hơn (không vô hiệu mã cũ trước khi giao)', async () => {
        const order: string[] = [];
        repo.save.mockImplementation((o: Partial<PhoneOtp>) => {
          order.push('save');
          return Promise.resolve({
            ...o,
            id: 'otp-new',
            createdAt: new Date(),
          } as PhoneOtp);
        });
        sender.send.mockImplementation(() => {
          order.push('send');
          return Promise.resolve();
        });
        repo.update.mockImplementation(() => {
          order.push('invalidate-older');
          return Promise.resolve({ affected: 1 });
        });

        await service.requestOtp(PHONE);

        expect(order).toEqual(['save', 'send', 'invalidate-older']);
        expect(repo.update).toHaveBeenCalledTimes(1);
        expect(repo.update).toHaveBeenCalledWith(
          expect.objectContaining({ phone: PHONE }),
          expect.objectContaining({ consumedAt: expect.any(Date) }),
        );
      });

      it('cổng SMS lỗi → vô hiệu mã vừa tạo, trả 503, log không lộ số/mã', async () => {
        sender.send.mockRejectedValue(new Error('SMS gateway trả HTTP 502'));
        const errorLog = jest
          .spyOn(Logger.prototype, 'error')
          .mockImplementation();

        const failure = await service.requestOtp(PHONE).then(
          () => null,
          (error: unknown) => error,
        );
        expect(failure).toBeInstanceOf(ServiceUnavailableException);
        expect((failure as ServiceUnavailableException).getStatus()).toBe(503);

        // chỉ consume đúng bản ghi mới; mã cũ (SMS trước đó) vẫn dùng được, không có lệnh vô hiệu theo số
        expect(repo.update).toHaveBeenCalledTimes(1);
        expect(repo.update).toHaveBeenCalledWith(
          expect.objectContaining({ id: 'otp-new' }),
          expect.objectContaining({ consumedAt: expect.any(Date) }),
        );
        expect(metrics.observeOtpDelivery).toHaveBeenCalledWith('failed');
        const logged = errorLog.mock.calls
          .map((call) => String(call[0]))
          .join('\n');
        expect(logged).toContain('otp-new');
        expect(logged).not.toContain(PHONE);
        expect(logged).not.toMatch(/\d{6}/u);
        errorLog.mockRestore();
      });

      it('consume mã sau lỗi giao cũng lỗi → vẫn trả đúng lỗi giao mã, không ném lỗi phụ', async () => {
        sender.send.mockRejectedValue(
          new Error('SMS gateway timeout sau 3000ms'),
        );
        repo.update.mockRejectedValueOnce(new Error('db down'));
        const errorLog = jest
          .spyOn(Logger.prototype, 'error')
          .mockImplementation();

        await expect(service.requestOtp(PHONE)).rejects.toBeInstanceOf(
          ServiceUnavailableException,
        );
        errorLog.mockRestore();
      });
    });

    it('delivery=disabled: chặn trước khi chạm DB hay sinh mã', async () => {
      settings['AUTH_OTP_DELIVERY'] = 'disabled';
      await expect(service.requestOtp(PHONE)).rejects.toMatchObject({
        code: AuthErrors.PHONE_OTP_DISABLED,
        httpStatus: 403,
      });
      expect(repo.countBy).not.toHaveBeenCalled();
      expect(repo.save).not.toHaveBeenCalled();
      expect(sender.send).not.toHaveBeenCalled();
    });
  });

  describe('onModuleInit — cảnh báo cấu hình nguy hiểm', () => {
    it('production + response + bật đăng nhập SĐT → log lỗi lớn (mã nằm trong response)', () => {
      settings['NODE_ENV'] = 'production';
      const errorLog = jest
        .spyOn(Logger.prototype, 'error')
        .mockImplementation();
      service.onModuleInit();
      expect(errorLog).toHaveBeenCalledTimes(1);
      errorLog.mockRestore();
    });

    it.each([
      ['dev + response', { NODE_ENV: 'development' }],
      [
        'production + sms-http',
        { NODE_ENV: 'production', AUTH_OTP_DELIVERY: 'sms-http' },
      ],
      [
        'production + disabled',
        { NODE_ENV: 'production', AUTH_OTP_DELIVERY: 'disabled' },
      ],
      [
        'production + response nhưng tắt SĐT',
        { NODE_ENV: 'production', AUTH_PHONE_OTP_ENABLED: false },
      ],
    ])('không cảnh báo khi %s', (_name, override) => {
      Object.assign(settings, override);
      const errorLog = jest
        .spyOn(Logger.prototype, 'error')
        .mockImplementation();
      service.onModuleInit();
      expect(errorLog).not.toHaveBeenCalled();
      errorLog.mockRestore();
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
      await expect(service.verifyOtp(PHONE, '123456')).rejects.toMatchObject({
        code: AuthErrors.OTP_EXPIRED,
      });

      repo.findOne.mockResolvedValue(
        storedOtp({ expiresAt: new Date(Date.now() - 1000) }),
      );
      await expect(service.verifyOtp(PHONE, '123456')).rejects.toMatchObject({
        code: AuthErrors.OTP_EXPIRED,
      });
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
      await expect(service.verifyOtp(PHONE, '999999')).rejects.toMatchObject({
        code: AuthErrors.OTP_INVALID,
      });
      expect(repo.update).not.toHaveBeenCalled();
    });

    it('2 request song song cùng mã đúng — chỉ 1 bên consume được (docs/10 § 10.0.D)', async () => {
      repo.findOne.mockResolvedValue(storedOtp());
      qb.execute.mockResolvedValue({ affected: 1 });
      repo.update.mockResolvedValue({ affected: 0 }); // bên kia đã consume trước
      await expect(service.verifyOtp(PHONE, '123456')).rejects.toMatchObject({
        code: AuthErrors.OTP_INVALID,
      });
    });
  });
});
