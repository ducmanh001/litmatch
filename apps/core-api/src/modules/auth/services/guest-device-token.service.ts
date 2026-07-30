import { createHmac } from 'node:crypto';

import { HttpStatus, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { DomainException } from '@litmatch/common-exceptions';

import type { CoreApiEnv } from '../../../config/env.validation';
import { AuthErrors } from '../auth.errors';

interface GuestDeviceTokenPayload {
  sub: string;
  deviceKey: string;
  purpose: 'guest-device';
}

/**
 * Token opaque ký bởi server, ràng buộc guest account với thiết bị đã dùng khi đăng nhập.
 * Matching chỉ nhận `deviceKey` đã HMAC từ token; deviceId thô không đi vào quota storage.
 */
@Injectable()
export class GuestDeviceTokenService {
  constructor(
    private readonly jwt: JwtService,
    private readonly config: ConfigService<CoreApiEnv, true>,
  ) {}

  issue(userId: string, deviceId: string): Promise<string> {
    const payload: GuestDeviceTokenPayload = {
      sub: userId,
      deviceKey: this.deviceKey(deviceId),
      purpose: 'guest-device',
    };
    return this.jwt.signAsync(payload, {
      secret: this.secret(),
      algorithm: 'HS256',
      audience: 'litmatch-matching',
      issuer: 'litmatch-core-api',
      expiresIn: `${this.config.getOrThrow('AUTH_GUEST_DEVICE_TOKEN_TTL_DAYS', { infer: true })}d`,
    });
  }

  async verifyForUser(token: string, userId: string): Promise<string> {
    try {
      const payload = await this.jwt.verifyAsync<GuestDeviceTokenPayload>(
        token,
        {
          secret: this.secret(),
          algorithms: ['HS256'],
          audience: 'litmatch-matching',
          issuer: 'litmatch-core-api',
        },
      );
      if (
        payload.purpose !== 'guest-device' ||
        payload.sub !== userId ||
        !/^[a-f0-9]{64}$/.test(payload.deviceKey)
      ) {
        throw new Error('guest device token binding invalid');
      }
      return payload.deviceKey;
    } catch {
      throw new DomainException(
        AuthErrors.GUEST_DEVICE_TOKEN_INVALID,
        'Guest device token không hợp lệ hoặc đã hết hạn',
        HttpStatus.UNAUTHORIZED,
      );
    }
  }

  private deviceKey(deviceId: string): string {
    return createHmac('sha256', this.secret())
      .update(`device:${deviceId}`)
      .digest('hex');
  }

  private secret(): string {
    return this.config.getOrThrow('AUTH_GUEST_DEVICE_TOKEN_SECRET', {
      infer: true,
    });
  }
}
