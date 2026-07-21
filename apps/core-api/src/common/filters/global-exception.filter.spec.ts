import { HttpStatus } from '@nestjs/common';
import { DomainException } from '@litmatch/common-exceptions';

import { GlobalExceptionFilter } from './global-exception.filter';

import type { ArgumentsHost } from '@nestjs/common';

describe('GlobalExceptionFilter', () => {
  it('localize DomainException theo Accept-Language nhưng giữ error code ổn định', () => {
    const json = jest.fn();
    const status = jest.fn().mockReturnValue({ json });
    const host = {
      switchToHttp: () => ({
        getRequest: () => ({
          id: 'request-1',
          headers: { 'accept-language': 'en-US,en;q=0.9' },
        }),
        getResponse: () => ({ status }),
      }),
    } as unknown as ArgumentsHost;

    new GlobalExceptionFilter().catch(
      new DomainException(
        'AUTH_OTP_INVALID',
        'Mã OTP không đúng',
        HttpStatus.BAD_REQUEST,
      ),
      host,
    );

    expect(status).toHaveBeenCalledWith(HttpStatus.BAD_REQUEST);
    expect(json).toHaveBeenCalledWith({
      error: {
        code: 'AUTH_OTP_INVALID',
        message: 'The verification code is incorrect.',
        traceId: 'request-1',
      },
    });
  });
});
