import { DomainException } from './domain-exception';

describe('DomainException', () => {
  it('giữ code, message, httpStatus, details', () => {
    const ex = new DomainException(
      'ECONOMY_WALLET_INSUFFICIENT_BALANCE',
      'Không đủ diamond',
      422,
      {
        required: 10,
      },
    );
    expect(ex.code).toBe('ECONOMY_WALLET_INSUFFICIENT_BALANCE');
    expect(ex.message).toBe('Không đủ diamond');
    expect(ex.httpStatus).toBe(422);
    expect(ex.details).toEqual({ required: 10 });
  });

  it('mặc định httpStatus = 400', () => {
    expect(new DomainException('X_Y_Z', 'x').httpStatus).toBe(400);
  });

  it('từ chối status ngoài dải 4xx — DomainException không bao giờ là lỗi hệ thống', () => {
    expect(() => new DomainException('X_Y_Z', 'x', 500)).toThrow();
    expect(() => new DomainException('X_Y_Z', 'x', 302)).toThrow();
  });
});
